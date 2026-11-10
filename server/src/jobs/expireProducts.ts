import cron from "node-cron";
import pool from "../config/db.js";
import { APP_TIMEZONE } from "../utils/dates.js";
import { createNotification } from "../utils/notifications.js";
import { cancelPendingItemsOfProducts, lockOrdersHoldingProducts } from "../services/orders/cascades.js";

// Marks Available products past their expiry date as Expired, cancels their Pending order items
// (a whole order when nothing is left or its restaurant did not accept partial fulfilment) and
// notifies the stores (per product) and the restaurants (per order), all in one transaction.
// Confirmed items are left alone: the store already agreed to hand that food over.
// Donation offers past their expiry date become Expired in the same run.
export const expireProducts = async (): Promise<number> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const due = await client.query<{ id: number }>(
      "SELECT products.id FROM products WHERE products.status = 'Available' AND products.expiry_date < CURRENT_DATE",
    );
    const dueIds = due.rows.map((product) => product.id);
    // The orders holding them first, then the products (the order paths' lock order).
    const orders = await lockOrdersHoldingProducts(client, dueIds);
    const expiredProducts = await client.query<{ id: number; store_id: number; name: string }>(
      `UPDATE products
       SET status = 'Expired'
       WHERE products.id = ANY($1::int[]) AND status = 'Available' AND expiry_date < CURRENT_DATE
       RETURNING id, store_id, name`,
      [dueIds],
    );

    if (expiredProducts.rows.length > 0) {
      const expiredIds = expiredProducts.rows.map((p) => p.id);

      for (const p of expiredProducts.rows) {
        await createNotification(client, {
          userId: p.store_id,
          type: "PRODUCT_EXPIRED",
          message: `${p.name} has expired and was removed from the marketplace.`,
          productId: p.id,
        });
      }

      const touched = await cancelPendingItemsOfProducts(client, orders, expiredIds, "EXPIRED", { source: "SYSTEM" });
      console.log(`Expired ${expiredIds.length} products and cancelled their pending items in ${touched} orders.`);
    }

    // Donation offers have no recipients yet, so expiring them needs no notification.
    await client.query(
      `UPDATE donation_offers
       SET status = 'Expired'
       WHERE status = 'Available' AND expiry_date < CURRENT_DATE`,
    );

    await client.query("COMMIT");
    return expiredProducts.rows.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const runExpiration = async () => {
  try {
    await expireProducts();
  } catch (error) {
    console.error("Error running expiration job:", error);
  }
};

export const startExpirationJob = () => {
  // Catch up on any midnight runs missed while the server was down.
  runExpiration();
  cron.schedule("0 0 * * *", runExpiration, { timezone: APP_TIMEZONE });
};
