import pool from "../config/db.js";
import { availableQuantity } from "./stock.js";
import { countStoreToday, listUrgentPendingOrders } from "./orders/queries.js";

// How many of each list the store home page shows.
export const STORE_HOME_ORDERS = 3;
export const STORE_HOME_PRODUCTS = 4;

// What restaurants' open orders hold of a product right now (Pending, Confirmed, InDelivery).
const RESERVED = `COALESCE(
  (SELECT SUM(order_items.quantity) FROM order_items
   WHERE order_items.product_id = products.id
     AND order_items.status IN ('Pending', 'Confirmed', 'InDelivery')), 0)`;

// The store home page in one request: the "Danas" counts, the most urgent orders waiting for an
// answer and the store's products that expire soonest (Available, not expired, with free
// quantity; the soonest expiry first). Credits come from GET /credits/me.
export const getStoreHome = async (storeId: number) => {
  const [counts, orders, products] = await Promise.all([
    countStoreToday(storeId),
    listUrgentPendingOrders(storeId, STORE_HOME_ORDERS),
    pool.query(
      `SELECT products.id, products.store_id, products.name, products.description, products.category, products.unit,
         products.image_url, products.quantity,
         products.original_price, products.discounted_price, products.expiry_date, products.status,
         (products.expiry_date - CURRENT_DATE) AS days_until_expiry,
         ${availableQuantity("products")}::text AS available_quantity,
         ${RESERVED}::text AS reserved_quantity
       FROM products
       WHERE products.store_id = $1 AND products.status = 'Available'
         AND products.expiry_date >= CURRENT_DATE AND ${availableQuantity("products")} > 0
       ORDER BY products.expiry_date ASC, products.id ASC
       LIMIT $2`,
      [storeId, STORE_HOME_PRODUCTS],
    ),
  ]);
  const expiringToday = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM products
     WHERE products.store_id = $1 AND products.status = 'Available'
       AND products.expiry_date = CURRENT_DATE AND ${availableQuantity("products")} > 0`,
    [storeId],
  );
  return {
    today: { ...counts, expiring_today: parseInt(expiringToday.rows[0]!.count, 10) },
    orders,
    products: products.rows,
  };
};
