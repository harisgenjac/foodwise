import cron from "node-cron";
import pool from "../config/db.js";

export const startExpirationJob = () => {
  cron.schedule("0 0 * * *", async () => {
    try {
      const expiredProducts = await pool.query(
        `UPDATE products 
         SET status = 'Expired' 
         WHERE status = 'Available' AND expiry_date < CURRENT_DATE 
         RETURNING id`,
      );

      if (expiredProducts.rows.length > 0) {
        const expiredIds = expiredProducts.rows.map((p) => p.id);

        const cancelledReservations = await pool.query(
          `UPDATE reservations 
           SET status = 'Cancelled' 
           WHERE product_id = ANY($1) AND status IN ('Pending', 'Confirmed')
           RETURNING restaurant_id`,
          [expiredIds],
        );

        await Promise.all(
          cancelledReservations.rows.map((r) =>
            pool.query(
              `INSERT INTO notifications (user_id, message) VALUES ($1, $2)`,
              [
                r.restaurant_id,
                "Vaša rezervacija je otkazana jer je proizvodu istekao rok trajanja.",
              ],
            ),
          ),
        );

        console.log(
          `Expired ${expiredIds.length} products and cancelled their active reservations.`,
        );
      }
    } catch (error) {
      console.error("Error running expiration job:", error);
    }
  });
};