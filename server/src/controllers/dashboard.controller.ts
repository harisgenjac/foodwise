import pool from "../config/db.js";
import type { Request, Response } from "express";

// Food saved as three columns (kg, l, pieces) over the order items matching `filter` (an SQL
// condition on reservations joined with products): g and ml are converted to kg and l, kom and pak
// are counted together as pieces. Also used for a branch's monthly stats (services/branches.ts).
export const savedUnits = (filter: string) => `
  COALESCE(SUM(CASE products.unit WHEN 'kg' THEN reservations.quantity WHEN 'g' THEN reservations.quantity / 1000 END)
    FILTER (WHERE ${filter}), 0) AS kg,
  COALESCE(SUM(CASE products.unit WHEN 'l' THEN reservations.quantity WHEN 'ml' THEN reservations.quantity / 1000 END)
    FILTER (WHERE ${filter}), 0) AS l,
  COALESCE(SUM(CASE WHEN products.unit IN ('kom', 'pak') THEN reservations.quantity END)
    FILTER (WHERE ${filter}), 0) AS pieces`;

// The dashboard stat cards, computed over all of the caller's data (the lists on the dashboard
// are only the 3 newest). The counts are orders: `pending_orders` waiting for the store's decision,
// `successful_orders` accepted ones (Confirmed + Completed). Food saved and savings count the
// picked-up (Completed) items with their accepted quantities.
export const getDashboardStats = async (req: Request, res: Response) => {
  const { id: userId, role } = req.user!;
  try {
    if (role === "STORE") {
      const products = await pool.query(
        `SELECT COUNT(*) AS active_products
         FROM products
         WHERE products.store_id = $1 AND products.status = 'Available'`,
        [userId],
      );
      const orders = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE orders.status = 'Pending') AS pending_orders,
           COUNT(*) FILTER (WHERE orders.status IN ('Confirmed', 'Completed')) AS successful_orders
         FROM orders
         WHERE orders.store_id = $1`,
        [userId],
      );
      const saved = await pool.query(
        `SELECT ${savedUnits("reservations.status = 'Completed'")}
         FROM reservations
         JOIN products ON reservations.product_id = products.id
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
    }

    const orders = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE orders.status = 'Pending') AS pending_orders,
         COUNT(*) FILTER (WHERE orders.status IN ('Confirmed', 'Completed')) AS successful_orders
       FROM orders
       WHERE orders.restaurant_id = $1`,
      [userId],
    );
    // Savings: the product's full price minus the price agreed on the item, per unit.
    const savings = await pool.query(
      `SELECT COALESCE(SUM((products.original_price - reservations.unit_price) * reservations.quantity)
         FILTER (WHERE reservations.status = 'Completed'), 0) AS savings
       FROM reservations
       JOIN products ON reservations.product_id = products.id
       WHERE reservations.restaurant_id = $1`,
      [userId],
    );
    const row = { ...orders.rows[0], ...savings.rows[0] };
    return res.status(200).json({
      message: "Dashboard stats fetched successfully.",
      stats: {
        pending_orders: parseInt(row.pending_orders, 10),
        successful_orders: parseInt(row.successful_orders, 10),
        savings: Number(row.savings),
      },
    });
  } catch (error) {
    console.error("Error while fetching dashboard stats:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching dashboard stats." });
  }
};
