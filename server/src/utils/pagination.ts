import type { Request } from "express";
import pool from "../config/db.js";
import { parseNonNegativeInt } from "./params.js";

// Default page sizes: card grids (12 fills 2- and 3-column rows) and tables.
export const CARD_PAGE_SIZE = 12;
export const TABLE_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export interface Page {
  limit: number;
  offset: number;
}

// `limit` (1..100, default `defaultLimit`) and `offset` (>= 0, default 0); null when either is
// invalid, which the caller answers with 400 "Invalid filter.".
export const parsePage = (query: Request["query"], defaultLimit: number): Page | null => {
  const limit = query.limit === undefined ? defaultLimit : parseNonNegativeInt(query.limit);
  const offset = query.offset === undefined ? 0 : parseNonNegativeInt(query.offset);
  if (limit === null || limit === 0 || limit > MAX_PAGE_SIZE || offset === null) return null;
  return { limit, offset };
};

// Runs a filtered list query and its total count; `from` is everything after SELECT ... .
// `orderBy` must end with a unique key (id) so no row repeats or goes missing across pages.
export const listPage = async (
  columns: string,
  from: string,
  orderBy: string,
  values: (string | number | boolean)[],
  page: Page,
) => {
  const total = await pool.query(`SELECT COUNT(*) AS total ${from}`, values);
  const result = await pool.query(
    `SELECT ${columns} ${from}
     ORDER BY ${orderBy}
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, page.limit, page.offset],
  );
  return { rows: result.rows, total: parseInt(total.rows[0].total, 10) };
};
