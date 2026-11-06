import type { Pool, PoolClient } from "pg";

// A product's stock, in one place. Quantity leaves the offer in two ways:
// - held by reservations: Pending, Confirmed and Completed ones (picked-up food is gone; Rejected
//   and Cancelled ones give their quantity back);
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

// What Pending, Confirmed and Completed reservations hold of one product, as a number.
export const reservedQuantity = async (db: Db, productId: number): Promise<number> => {
  const result = await db.query<{ held: string }>(
    `SELECT ${heldByReservations("products")} AS held FROM products WHERE products.id = $1`,
    [productId],
  );
  return parseFloat(result.rows[0]?.held ?? "0");
};
