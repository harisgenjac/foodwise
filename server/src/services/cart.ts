import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { HttpError } from "../utils/httpError.js";
import { parseNumber } from "../utils/params.js";
import { visibleStore } from "../utils/visibility.js";
import { availableQuantity, sellableProduct } from "./stock.js";
import { MAX_ORDER_ITEMS, MAX_PENDING_ORDERS } from "./orders/send.js";

// The restaurant's cart (docs/orders-design.md, section 4): lines of one store, no stock held.
// GET /cart answers every line with the product's live state and flags, so the cart never shows
// stale stock; sending the order (services/orders/send.ts) removes the sent lines.

type Db = Pool | PoolClient;

// The first key of the cart's transaction-scoped advisory lock (the second is the restaurant id),
// so two parallel adds of one restaurant cannot both pass the one-store and line-count rules.
const CART_LOCK_NAMESPACE = 42;

export type UnavailableReason = "SOLD_OUT" | "EXPIRED" | "REMOVED" | "STORE_UNAVAILABLE";

export interface CartFlags {
  unavailable: boolean;
  unavailable_reason: UnavailableReason | null;
  quantity_exceeds: boolean;
  price_lowered: boolean;
  price_raised: boolean;
}

interface CartRow {
  product_id: number;
  store_id: number;
  store_name: string | null;
  name: string;
  category: string;
  unit: string;
  status: string;
  expiry_date: string;
  original_price: string;
  discounted_price: string;
  quantity: string;
  unit_price_seen: string;
  added_at: string;
  sellable: boolean;
  is_expired: boolean;
  store_visible: boolean;
  available_quantity: string;
}

export interface CartLine {
  product_id: number;
  name: string;
  category: string;
  unit: string;
  expiry_date: string;
  original_price: string;
  // The current price; unit_price_seen is the one the restaurant saw.
  discounted_price: string;
  quantity: string;
  unit_price_seen: string;
  available_quantity: string;
  added_at: string;
  flags: CartFlags;
}

export interface Cart {
  store: { id: number; business_name: string | null } | null;
  items: CartLine[];
  // What would be sent now: lines that are available and not more expensive, each with at most
  // the free quantity, at the current price.
  totals: { lines: number; total: string };
  pending_orders: number;
  max_pending_orders: number;
}

// Prices are compared in whole cents, so 3.5 and "3.50" are the same price.
const cents = (value: string | number) => Math.round(Number(value) * 100);

const unavailableReason = (row: CartRow, available: number): UnavailableReason | null => {
  if (row.status === "Removed") return "REMOVED";
  if (row.status === "Expired" || row.is_expired) return "EXPIRED";
  if (!row.store_visible) return "STORE_UNAVAILABLE";
  if (!row.sellable || available <= 0) return "SOLD_OUT";
  return null;
};

const toLine = (row: CartRow): CartLine => {
  const available = Math.max(parseFloat(row.available_quantity), 0);
  const reason = unavailableReason(row, available);
  const quantity = parseFloat(row.quantity);
  return {
    product_id: row.product_id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    expiry_date: row.expiry_date,
    original_price: row.original_price,
    discounted_price: row.discounted_price,
    quantity: row.quantity,
    unit_price_seen: row.unit_price_seen,
    available_quantity: reason ? "0" : String(available),
    added_at: row.added_at,
    flags: {
      unavailable: reason !== null,
      unavailable_reason: reason,
      quantity_exceeds: reason === null && available < quantity,
      price_lowered: cents(row.discounted_price) < cents(row.unit_price_seen),
      price_raised: cents(row.discounted_price) > cents(row.unit_price_seen),
    },
  };
};

const CART_LINES = `
  SELECT cart_items.product_id, products.store_id, stores.business_name AS store_name,
         products.name, products.category, products.unit, products.status, products.expiry_date,
         products.original_price, products.discounted_price,
         cart_items.quantity, cart_items.unit_price_seen, cart_items.added_at,
         ${sellableProduct("products", "stores")} AS sellable,
         products.expiry_date < CURRENT_DATE AS is_expired,
         ${visibleStore("stores")} AS store_visible,
         ${availableQuantity("products")} AS available_quantity
  FROM cart_items
  JOIN products ON products.id = cart_items.product_id
  JOIN users AS stores ON stores.id = products.store_id
  WHERE cart_items.restaurant_id = $1
  ORDER BY cart_items.added_at, cart_items.product_id`;

const countPendingOrders = async (db: Db, restaurantId: number) => {
  const result = await db.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM orders WHERE orders.restaurant_id = $1 AND orders.status = 'Pending'",
    [restaurantId],
  );
  return Number(result.rows[0]!.count);
};

export const getCart = async (restaurantId: number, db: Db = pool): Promise<Cart> => {
  const result = await db.query<CartRow>(CART_LINES, [restaurantId]);
  const items = result.rows.map(toLine);
  const first = result.rows[0];
  let total = 0;
  for (const line of items) {
    if (line.flags.unavailable || line.flags.price_raised) continue;
    total += Math.min(parseFloat(line.quantity), parseFloat(line.available_quantity)) * parseFloat(line.discounted_price);
  }
  return {
    store: first ? { id: first.store_id, business_name: first.store_name } : null,
    items,
    totals: { lines: items.length, total: total.toFixed(2) },
    pending_orders: await countPendingOrders(db, restaurantId),
    max_pending_orders: MAX_PENDING_ORDERS,
  };
};

export interface PutCartItemInput {
  quantity: number;
  replace: boolean;
  acceptPrice: boolean;
}

// Validates the body of PUT /cart/items/:productId.
export const parseCartItemBody = (body: Record<string, unknown>): PutCartItemInput => {
  const quantity = parseNumber(body.quantity);
  if (quantity === null || quantity <= 0) {
    throw new HttpError(400, "Quantity must be greater than zero.");
  }
  if (
    (body.replace !== undefined && typeof body.replace !== "boolean") ||
    (body.accept_price !== undefined && typeof body.accept_price !== "boolean")
  ) {
    throw new HttpError(400, "Invalid request format.");
  }
  return { quantity, replace: body.replace === true, acceptPrice: body.accept_price === true };
};

interface ProductForCart {
  id: number;
  store_id: number;
  discounted_price: string;
  sellable: boolean;
  available: string;
}

// Adds a product or sets its line's quantity. Another store's product is refused with 409
// CART_OTHER_STORE unless `replace` empties the cart first. The line keeps the price it was added
// at (unit_price_seen) until the restaurant accepts a new one (`acceptPrice`).
export const putCartItem = async (client: PoolClient, restaurantId: number, productId: number, input: PutCartItemInput) => {
  await client.query("SELECT pg_advisory_xact_lock($1, $2)", [CART_LOCK_NAMESPACE, restaurantId]);
  const found = await client.query<ProductForCart>(
    `SELECT products.id, products.store_id, products.discounted_price,
            ${sellableProduct("products", "stores")} AS sellable,
            ${availableQuantity("products")} AS available
     FROM products
     JOIN users AS stores ON stores.id = products.store_id
     WHERE products.id = $1`,
    [productId],
  );
  const product = found.rows[0];
  if (!product) throw new HttpError(404, "Product not found.");
  if (!product.sellable || parseFloat(product.available) <= 0) {
    throw new HttpError(400, "This product is no longer available.");
  }
  if (input.quantity > parseFloat(product.available)) {
    throw new HttpError(400, "Not enough product available.");
  }

  const lines = await client.query<{ product_id: number; store_id: number; store_name: string | null }>(
    `SELECT cart_items.product_id, products.store_id, stores.business_name AS store_name
     FROM cart_items
     JOIN products ON products.id = cart_items.product_id
     JOIN users AS stores ON stores.id = products.store_id
     WHERE cart_items.restaurant_id = $1`,
    [restaurantId],
  );
  const other = lines.rows.find((line) => line.store_id !== product.store_id);
  if (other) {
    if (!input.replace) {
      throw new HttpError(409, "The cart has products from another store.", {
        code: "CART_OTHER_STORE",
        store_name: other.store_name,
      });
    }
    await client.query("DELETE FROM cart_items WHERE cart_items.restaurant_id = $1", [restaurantId]);
  }
  const inCart = !other && lines.rows.some((line) => line.product_id === productId);
  if (!inCart && (other ? 0 : lines.rows.length) >= MAX_ORDER_ITEMS) {
    throw new HttpError(400, `The cart can hold at most ${MAX_ORDER_ITEMS} products.`);
  }

  await client.query(
    `INSERT INTO cart_items (restaurant_id, product_id, quantity, unit_price_seen)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (restaurant_id, product_id) DO UPDATE
       SET quantity = EXCLUDED.quantity,
           unit_price_seen = CASE WHEN $5 THEN EXCLUDED.unit_price_seen ELSE cart_items.unit_price_seen END`,
    [restaurantId, productId, input.quantity, product.discounted_price, input.acceptPrice],
  );
  return getCart(restaurantId, client);
};

// Removes one line; a product that is not in the cart is a 404.
export const deleteCartItem = async (restaurantId: number, productId: number) => {
  const result = await pool.query(
    "DELETE FROM cart_items WHERE cart_items.restaurant_id = $1 AND cart_items.product_id = $2",
    [restaurantId, productId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "This product is not in the cart.");
  return getCart(restaurantId);
};

export const clearCart = async (restaurantId: number) => {
  await pool.query("DELETE FROM cart_items WHERE cart_items.restaurant_id = $1", [restaurantId]);
  return getCart(restaurantId);
};

// Removes every line restaurants can no longer order (the cart's "remove unavailable"): the same rule as the
// `unavailable` flag.
export const clearUnavailableLines = async (restaurantId: number) => {
  await pool.query(
    `DELETE FROM cart_items
     USING products, users AS stores
     WHERE cart_items.restaurant_id = $1
       AND products.id = cart_items.product_id
       AND stores.id = products.store_id
       AND (NOT ${sellableProduct("products", "stores")} OR ${availableQuantity("products")} <= 0)`,
    [restaurantId],
  );
  return getCart(restaurantId);
};
