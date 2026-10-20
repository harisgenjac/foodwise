import cron from "node-cron";
import pool from "../config/db.js";
import { APP_TIMEZONE } from "../utils/dates.js";

// Sends the daily reminders. Each one is sent at most once per product or
// reservation (NOT EXISTS), so running the job again the same day is safe.
export const sendReminders = async (): Promise<{ expiringSoon: number; pickupToday: number }> => {
  // Stores: products that expire tomorrow and still have Pending requests.
  const expiringSoon = await pool.query(
    `INSERT INTO notifications (user_id, type, message, product_id)
     SELECT products.store_id, 'PRODUCT_EXPIRING_SOON',
            'Reminder: ' || products.name || ' expires tomorrow and has pending reservation requests.',
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
       )`,
  );

  // Restaurants: confirmed reservations to pick up today.
  const pickupToday = await pool.query(
    `INSERT INTO notifications (user_id, type, message, reservation_id, product_id)
     SELECT reservations.restaurant_id, 'PICKUP_TODAY',
            'Reminder: pick up ' || products.name || ' today.',
            reservations.id, reservations.product_id
     FROM reservations
     JOIN products ON reservations.product_id = products.id
     WHERE reservations.status = 'Confirmed'
       AND reservations.pickup_date::date = CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM notifications
         WHERE notifications.type = 'PICKUP_TODAY' AND notifications.reservation_id = reservations.id
       )`,
  );

  return { expiringSoon: expiringSoon.rowCount ?? 0, pickupToday: pickupToday.rowCount ?? 0 };
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
