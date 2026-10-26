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
// It follows the store dashboard's rules: picked-up (Completed) reservations only, g/kg as kg,
// ml/l as l, kom and pak as pieces. Value and savings follow the impact report.
export const getSavedTotals = async (db: Pool | PoolClient = pool): Promise<SavedTotals> => {
  const result = await db.query<Record<keyof SavedTotals, string>>(
    `SELECT
       COALESCE(SUM(CASE products.unit
         WHEN 'kg' THEN reservations.quantity
         WHEN 'g' THEN reservations.quantity / 1000 END), 0) AS kg,
       COALESCE(SUM(CASE products.unit
         WHEN 'l' THEN reservations.quantity
         WHEN 'ml' THEN reservations.quantity / 1000 END), 0) AS l,
       COALESCE(SUM(CASE WHEN products.unit IN ('kom', 'pak') THEN reservations.quantity END), 0) AS pieces,
       COALESCE(ROUND(SUM(reservations.unit_price * reservations.quantity), 2), 0) AS value,
       COALESCE(ROUND(SUM(GREATEST(products.original_price - reservations.unit_price, 0) * reservations.quantity), 2), 0) AS savings
     FROM reservations
     JOIN products ON reservations.product_id = products.id
     WHERE reservations.status = 'Completed'`,
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
