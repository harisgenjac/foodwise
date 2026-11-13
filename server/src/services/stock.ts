import type { Pool, PoolClient } from "pg";
import { createNotification } from "../utils/notifications.js";
import { visibleStore } from "../utils/visibility.js";

// A product's stock, in one place. Quantity leaves the offer in two ways:
// - held by order items (the `reservations` table until the orders cleanup renames it): Pending,
//   Confirmed and Completed ones, each with its current quantity (the accepted one once the store
//   decided; picked-up food is gone; Rejected and Cancelled ones give their quantity back);
// - sold in the store's own shop (Sold in shop, product_shop_sales), which only ever lowers it.
// available = quantity − held − sold in shop. A product is sold out (status Sold) once Confirmed
// and Completed reservations plus shop sales cover its quantity; Pending ones do not count there,
// because the store has not agreed to them yet.

type Db = Pool | PoolClient;

// SQL expressions for a product row aliased `alias` (each a number, COALESCEd to 0).
export const heldByReservations = (alias: string) => `COALESCE(
  (SELECT SUM(reservations.quantity) FROM reservations
   WHERE reservations.product_id = ${alias}.id
     AND reservations.status IN ('Pending', 'Confirmed', 'Completed')), 0)`;

export const soldInShop = (alias: string) => `COALESCE(
  (SELECT SUM(product_shop_sales.quantity) FROM product_shop_sales
   WHERE product_shop_sales.product_id = ${alias}.id), 0)`;

export const availableQuantity = (alias: string) =>
  `(${alias}.quantity - ${heldByReservations(alias)} - ${soldInShop(alias)})`;

// Whether restaurants can order the product row `alias` of the store row `storeAlias` at all
// (before its free quantity): Available, not past its expiry date, and the store visible (not
// blocked, its company not blocked, not a deactivated branch). Sending an order and the cart use
// the same rule.
export const sellableProduct = (alias: string, storeAlias: string) =>
  `(${alias}.status = 'Available' AND ${alias}.expiry_date >= CURRENT_DATE AND ${visibleStore(storeAlias)})`;

// The free quantity of one product, as a number. The caller holds the product's row lock when it
// writes based on it (reserving, a shop sale), so nothing can take the same quantity meanwhile.
export const freeQuantity = async (db: Db, productId: number): Promise<number> => {
  const result = await db.query<{ available: string }>(
    `SELECT ${availableQuantity("products")} AS available FROM products WHERE products.id = $1`,
    [productId],
  );
  return parseFloat(result.rows[0]?.available ?? "0");
};

// What keeps a product sold out: Confirmed and Completed reservations plus shop sales.
export const soldOutCover = async (db: Db, productId: number): Promise<number> => {
  const result = await db.query<{ covered: string }>(
    `SELECT COALESCE(
       (SELECT SUM(reservations.quantity) FROM reservations
        WHERE reservations.product_id = products.id AND reservations.status IN ('Confirmed', 'Completed')), 0)
       + ${soldInShop("products")} AS covered
     FROM products WHERE products.id = $1`,
    [productId],
  );
  return parseFloat(result.rows[0]?.covered ?? "0");
};

// Marks the product Sold once Confirmed (or already picked up) items and shop sales cover its
// whole quantity (soldOutCover). The caller's transaction must hold the lock on the product row.
// `notify` is false when the store sold the rest itself in its shop: it needs no notification.
export const markSoldIfFullyConfirmed = async (
  client: PoolClient,
  product: { id: number; store_id: number; name: string; quantity: string },
  { notify = true }: { notify?: boolean } = {},
) => {
  if ((await soldOutCover(client, product.id)) < parseFloat(product.quantity)) {
    return false;
  }
  await client.query("UPDATE products SET status = 'Sold' WHERE id = $1", [product.id]);
  if (!notify) return true;
  await createNotification(client, {
    userId: product.store_id,
    type: "PRODUCT_SOLD_OUT",
    message: `${product.name} is sold out.`,
    productId: product.id,
  });
  return true;
};

// After a Confirmed item was cancelled: a product it had sold out becomes Available again, unless
// it has expired or Confirmed + Completed items and shop sales still cover its quantity. Locks the
// product row.
export const releaseSoldProduct = async (client: PoolClient, productId: number) => {
  const productResult = await client.query(
    "SELECT id, status, quantity, expiry_date < CURRENT_DATE AS is_expired FROM products WHERE id = $1 FOR UPDATE",
    [productId],
  );
  const product = productResult.rows[0];
  if (!product || product.status !== "Sold" || product.is_expired) return;
  if ((await soldOutCover(client, product.id)) < parseFloat(product.quantity)) {
    await client.query("UPDATE products SET status = 'Available' WHERE id = $1", [product.id]);
  }
};

// What Pending items hold of the product row `alias` (a number, COALESCEd to 0).
export const pendingHeld = (alias: string) => `COALESCE(
  (SELECT SUM(reservations.quantity) FROM reservations
   WHERE reservations.product_id = ${alias}.id AND reservations.status = 'Pending'), 0)`;

// The shop's shortage (products.shop_shortage) is food the till sold that Pending items still
// hold. Whenever Pending quantity is freed, this turns as much of it as is now free into a shop
// sale (with the order that freed it), so that food never comes back on offer. Locks the product
// row; the caller already holds the order's lock (orders first, then products).
export const absorbShopShortage = async (
  client: PoolClient,
  productId: number,
  { orderId = null, actorId = null }: { orderId?: number | null; actorId?: number | null } = {},
) => {
  const result = await client.query<{ id: number; store_id: number; name: string; quantity: string; shop_shortage: string; status: string }>(
    `SELECT products.id, products.store_id, products.name, products.quantity, products.shop_shortage, products.status
     FROM products WHERE products.id = $1 FOR UPDATE`,
    [productId],
  );
  const product = result.rows[0];
  const shortage = parseFloat(product?.shop_shortage ?? "0");
  if (!product || shortage <= 0) return 0;
  const taken = Math.min(shortage, await freeQuantity(client, productId));
  if (taken <= 0) return 0;
  await client.query(
    `INSERT INTO product_shop_sales (product_id, store_id, quantity, created_by, order_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [product.id, product.store_id, taken, actorId, orderId],
  );
  await client.query(
    "UPDATE products SET shop_shortage = GREATEST(products.shop_shortage - $2, 0) WHERE products.id = $1",
    [product.id, taken],
  );
  // The store sold it itself, so a product that is now covered needs no "sold out" notification.
  if (product.status === "Available") await markSoldIfFullyConfirmed(client, product, { notify: false });
  return taken;
};

// What Pending, Confirmed and Completed reservations hold of one product, as a number.
export const reservedQuantity = async (db: Db, productId: number): Promise<number> => {
  const result = await db.query<{ held: string }>(
    `SELECT ${heldByReservations("products")} AS held FROM products WHERE products.id = $1`,
    [productId],
  );
  return parseFloat(result.rows[0]?.held ?? "0");
};
