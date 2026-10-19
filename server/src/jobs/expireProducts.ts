import cron from "node-cron";
import pool from "../config/db.js";
import { createNotification } from "../utils/notifications.js";

// Marks Available products past their expiry date as Expired, cancels their
// active reservations and notifies the stores and restaurants, all in one transaction.
export const expireProducts = async (): Promise<number> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const expiredProducts = await client.query(
      `UPDATE products
       SET status = 'Expired'
       WHERE status = 'Available' AND expiry_date < CURRENT_DATE
       RETURNING id, store_id, name`,
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

      const cancelledReservations = await client.query(
        `UPDATE reservations
         SET status = 'Cancelled'
         WHERE product_id = ANY($1) AND status IN ('Pending', 'Confirmed')
         RETURNING id, restaurant_id, product_id`,
        [expiredIds],
      );

      for (const r of cancelledReservations.rows) {
        const product = expiredProducts.rows.find((p) => p.id === r.product_id);
        await createNotification(client, {
          userId: r.restaurant_id,
          type: "RESERVATION_EXPIRED",
          message: `Your reservation for ${product?.name} was cancelled because the product expired.`,
          reservationId: r.id,
          productId: r.product_id,
        });
      }

      console.log(
        `Expired ${expiredIds.length} products and cancelled their active reservations.`,
      );
    }

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
  cron.schedule("0 0 * * *", runExpiration);
};
