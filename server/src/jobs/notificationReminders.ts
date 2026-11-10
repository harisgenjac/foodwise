import cron from "node-cron";
import pool from "../config/db.js";
import { APP_TIMEZONE } from "../utils/dates.js";
import { enqueueNotificationEmails, insertedIds } from "../email/queue.js";

// Sends the daily reminders. Each one is sent at most once per product or
// order (NOT EXISTS), so running the job again the same day is safe. One transaction, so
// the reminders and their emails are stored together.
export const sendReminders = async (): Promise<{ expiringSoon: number; pickupToday: number }> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Stores: products that expire tomorrow and still have Pending requests.
    const expiringSoon = await client.query<{ id: number }>(
      `INSERT INTO notifications (user_id, type, message, product_id)
       SELECT products.store_id, 'PRODUCT_EXPIRING_SOON',
              'Reminder: ' || products.name || ' expires tomorrow and has pending orders.',
              products.id
       FROM products
       WHERE products.status = 'Available'
         AND products.expiry_date = CURRENT_DATE + 1
         AND EXISTS (
           SELECT 1 FROM reservations
           WHERE reservations.product_id = products.id AND reservations.status = 'Pending'
         )
         AND NOT EXISTS (
           SELECT 1 FROM notifications
           WHERE notifications.type = 'PRODUCT_EXPIRING_SOON' AND notifications.product_id = products.id
         )
       RETURNING notifications.id`,
    );

    // Restaurants: accepted orders to pick up today, once per order.
    const pickupToday = await client.query<{ id: number }>(
      `INSERT INTO notifications (user_id, type, message, order_id)
       SELECT orders.restaurant_id, 'ORDER_PICKUP_TODAY',
              'Reminder: pick up order #' || orders.code || ' today.',
              orders.id
       FROM orders
       WHERE orders.status = 'Confirmed'
         AND orders.pickup_at::date = CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1 FROM notifications
           WHERE notifications.type = 'ORDER_PICKUP_TODAY' AND notifications.order_id = orders.id
         )
       RETURNING notifications.id`,
    );
    await enqueueNotificationEmails(client, [...insertedIds(expiringSoon), ...insertedIds(pickupToday)]);
    await client.query("COMMIT");

    return { expiringSoon: expiringSoon.rowCount ?? 0, pickupToday: pickupToday.rowCount ?? 0 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const runReminders = async () => {
  try {
    await sendReminders();
  } catch (error) {
    console.error("Error running reminder job:", error);
  }
};

export const startReminderJob = () => {
  // Catch up on a morning run missed while the server was down.
  runReminders();
  cron.schedule("0 7 * * *", runReminders, { timezone: APP_TIMEZONE });
};
