import pool from "../config/db.js";
import type { Pool, PoolClient } from "pg";

export interface SavedTotals {
  kg: number;
  l: number;
  pieces: number;
  value: number;
  savings: number;
}

// Platform-wide food saved, shared by the admin statistics and the footer's impact counter.
// It follows the store dashboard's rules: picked-up (Completed) order items only, g/kg as kg,
// ml/l as l, kom and pak as pieces. Value and savings follow the impact report.
export const getSavedTotals = async (db: Pool | PoolClient = pool): Promise<SavedTotals> => {
  const result = await db.query<Record<keyof SavedTotals, string>>(
    `SELECT
       COALESCE(SUM(CASE products.unit
         WHEN 'kg' THEN order_items.quantity
         WHEN 'g' THEN order_items.quantity / 1000 END), 0) AS kg,
       COALESCE(SUM(CASE products.unit
         WHEN 'l' THEN order_items.quantity
         WHEN 'ml' THEN order_items.quantity / 1000 END), 0) AS l,
       COALESCE(SUM(CASE WHEN products.unit IN ('kom', 'pak') THEN order_items.quantity END), 0) AS pieces,
       COALESCE(ROUND(SUM(order_items.unit_price * order_items.quantity), 2), 0) AS value,
       COALESCE(ROUND(SUM(GREATEST(products.original_price - order_items.unit_price, 0) * order_items.quantity), 2), 0) AS savings
     FROM order_items
     JOIN products ON order_items.product_id = products.id
     WHERE order_items.status = 'Completed'`,
  );
  const row = result.rows[0]!;
  return {
    kg: Number(row.kg),
    l: Number(row.l),
    pieces: Number(row.pieces),
    value: Number(row.value),
    savings: Number(row.savings),
  };
};
