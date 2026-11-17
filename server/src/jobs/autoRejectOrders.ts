import cron from "node-cron";
import pool from "../config/db.js";
import { APP_TIMEZONE } from "../utils/dates.js";
import { createNotification } from "../utils/notifications.js";
import { inTransaction } from "../utils/transaction.js";
import { formatOrderCode, type OrderRow } from "../services/orders/codes.js";
import { AUTO_REJECT_AT, lockOrderItems, moveItems, syncOrderStatus } from "../services/orders/status.js";

// Rejects the Pending orders whose store did not answer in time (AUTO_REJECT_AT: a delivery order
// 15 minutes after it was sent, a pickup order at its pickup time). Each order in its own
// transaction: locked with SKIP LOCKED (a store deciding it right now goes first; the next run
// sees it decided), then its items and products in the usual lock order. Rejecting frees the
// quantity like the store's own rejection, the history records source SYSTEM and both sides get
// ORDER_AUTO_REJECTED. A Pending delivery order has no delivery yet, so there is nothing to cancel
// with the provider. Returns how many orders were rejected.
export const autoRejectOrders = async (): Promise<number> => {
  const due = await pool.query<{ id: number }>(
    `SELECT orders.id FROM orders
     WHERE orders.status = 'Pending' AND ${AUTO_REJECT_AT} <= LOCALTIMESTAMP
     ORDER BY orders.id`,
  );
  let rejected = 0;
  for (const { id } of due.rows) {
    const done = await inTransaction(async (client) => {
      const locked = await client.query<OrderRow>(
        `SELECT orders.* FROM orders
         WHERE orders.id = $1 AND orders.status = 'Pending' AND ${AUTO_REJECT_AT} <= LOCALTIMESTAMP
         FOR UPDATE SKIP LOCKED`,
        [id],
      );
      const order = locked.rows[0];
      if (!order) return false;
      await lockOrderItems(client, order.id);
      await moveItems(client, order.id, ["Pending"], "Rejected");
      await syncOrderStatus(client, order.id, { source: "SYSTEM" });
      const message = `Order ${formatOrderCode(order.code)} was rejected automatically because the store did not answer in time.`;
      for (const userId of [order.restaurant_id, order.store_id]) {
        await createNotification(client, { userId, type: "ORDER_AUTO_REJECTED", message, orderId: order.id });
      }
      return true;
    });
    if (done) rejected++;
  }
  return rejected;
};

let running = false;

// One run at a time: a slow run is not started again by the next minute's tick.
const runAutoReject = async () => {
  if (running) return;
  running = true;
  try {
    const rejected = await autoRejectOrders();
    if (rejected > 0) console.log(`Rejected ${rejected} orders the store did not answer in time.`);
  } catch (error) {
    console.error("Error running the automatic rejection job:", error);
  } finally {
    running = false;
  }
};

// From server.ts only (tests call autoRejectOrders): at startup, to catch up, then every minute.
export const startAutoRejectJob = () => {
  void runAutoReject();
  cron.schedule("* * * * *", runAutoReject, { timezone: APP_TIMEZONE });
};
