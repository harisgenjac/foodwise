import pool from "../config/db.js";
import type { Request, Response } from "express";
import { savedUnits } from "../utils/savedFood.js";

// The store dashboard's stat cards, computed over all of the store's data (the lists on the
// dashboard are only the 3 newest). The counts are orders: `pending_orders` waiting for the store's
// decision, `successful_orders` accepted ones (Confirmed + Completed). Food saved counts the
// picked-up (Completed) items with their accepted quantities.
export const getDashboardStats = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  try {
    const products = await pool.query(
      `SELECT COUNT(*) AS active_products
       FROM products
       WHERE products.store_id = $1 AND products.status = 'Available'
         AND products.expiry_date >= CURRENT_DATE`,
      [userId],
    );
    const orders = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE orders.status = 'Pending') AS pending_orders,
         COUNT(*) FILTER (WHERE orders.status IN ('Confirmed', 'InDelivery', 'Completed')) AS successful_orders
       FROM orders
       WHERE orders.store_id = $1`,
      [userId],
    );
    const saved = await pool.query(
      `SELECT ${savedUnits("order_items.status = 'Completed'")}
       FROM order_items
       JOIN products ON order_items.product_id = products.id
       WHERE products.store_id = $1`,
      [userId],
    );
    const row = { ...orders.rows[0], ...saved.rows[0] };
    return res.status(200).json({
      message: "Dashboard stats fetched successfully.",
      stats: {
        active_products: parseInt(products.rows[0].active_products, 10),
        pending_orders: parseInt(row.pending_orders, 10),
        successful_orders: parseInt(row.successful_orders, 10),
        saved: { kg: Number(row.kg), l: Number(row.l), pieces: Number(row.pieces) },
      },
    });
  } catch (error) {
    console.error("Error while fetching dashboard stats:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching dashboard stats." });
  }
};
