import pool from "../config/db.js";
import type { Request, Response } from "express";

// The dashboard stat cards, computed over all of the caller's data (the lists on the dashboard
// are only the 3 newest). `successful_reservations` counts accepted ones (Confirmed + Completed);
// food saved and savings count only picked-up (Completed) ones.
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
      // Food saved: g and ml are converted to kg and l, kom and pak are counted together as pieces.
      const reservations = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE reservations.status = 'Pending') AS pending_reservations,
           COUNT(*) FILTER (WHERE reservations.status IN ('Confirmed', 'Completed')) AS successful_reservations,
           COALESCE(SUM(CASE products.unit WHEN 'kg' THEN reservations.quantity WHEN 'g' THEN reservations.quantity / 1000 END)
             FILTER (WHERE reservations.status = 'Completed'), 0) AS kg,
           COALESCE(SUM(CASE products.unit WHEN 'l' THEN reservations.quantity WHEN 'ml' THEN reservations.quantity / 1000 END)
             FILTER (WHERE reservations.status = 'Completed'), 0) AS l,
           COALESCE(SUM(CASE WHEN products.unit IN ('kom', 'pak') THEN reservations.quantity END)
             FILTER (WHERE reservations.status = 'Completed'), 0) AS pieces
         FROM reservations
         JOIN products ON reservations.product_id = products.id
         WHERE products.store_id = $1`,
        [userId],
      );
      const row = reservations.rows[0];
      return res.status(200).json({
        message: "Dashboard stats fetched successfully.",
        stats: {
          active_products: parseInt(products.rows[0].active_products, 10),
          pending_reservations: parseInt(row.pending_reservations, 10),
          successful_reservations: parseInt(row.successful_reservations, 10),
          saved: { kg: Number(row.kg), l: Number(row.l), pieces: Number(row.pieces) },
        },
      });
    }

    // Savings: the product's full price minus the price agreed on the reservation, per unit.
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE reservations.status = 'Pending') AS pending_reservations,
         COUNT(*) FILTER (WHERE reservations.status IN ('Confirmed', 'Completed')) AS successful_reservations,
         COALESCE(SUM((products.original_price - reservations.unit_price) * reservations.quantity)
           FILTER (WHERE reservations.status = 'Completed'), 0) AS savings
       FROM reservations
       JOIN products ON reservations.product_id = products.id
       WHERE reservations.restaurant_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return res.status(200).json({
      message: "Dashboard stats fetched successfully.",
      stats: {
        pending_reservations: parseInt(row.pending_reservations, 10),
        successful_reservations: parseInt(row.successful_reservations, 10),
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
