import pool from "../config/db.js";
import type { Request, Response } from "express";
import { pickupOwnership } from "./reservations.controller.js";
import { isValidDate } from "../utils/dates.js";
import { toCsv, type CsvCell } from "../utils/csv.js";
import {
  categoryLabel,
  impactHeaders,
  parseReportLanguage,
  salesHeaders,
  totalLabel,
} from "../utils/reportLabels.js";

// Longest period a report may cover: one (leap) year, both days included.
const MAX_PERIOD_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Period {
  from: string;
  to: string;
}

// Both dates are required (YYYY-MM-DD), from <= to, and at most MAX_PERIOD_DAYS long.
const parsePeriod = (query: Request["query"]): Period | null => {
  const { from, to } = query;
  if (!isValidDate(from) || !isValidDate(to)) return null;
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (days < 1 || days > MAX_PERIOD_DAYS) return null;
  return { from, to };
};

const sendCsv = (res: Response, name: string, period: Period, csv: string) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}-${period.from}-${period.to}.csv"`);
  return res.status(200).send(csv);
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

interface SalesRow {
  picked_up_on: string;
  id: number;
  product_name: string;
  category: string;
  party_name: string;
  city: string | null;
  quantity: string;
  unit: string;
  unit_price: string;
  original_price: string;
  total: string;
  savings: string;
}

// Picked-up (Completed) reservations in the period: what a store sold or a restaurant bought.
export const getSalesReport = async (req: Request, res: Response) => {
  const { id: userId, role } = req.user!;
  const period = parsePeriod(req.query);
  if (!period) {
    return res.status(400).json({ error: "Invalid period." });
  }
  const lang = parseReportLanguage(req.query.lang);

  try {
    const { owner, partyJoin } = pickupOwnership(role);
    const result = await pool.query<SalesRow>(
      `SELECT
         to_char(reservations.picked_up_at, 'YYYY-MM-DD') AS picked_up_on,
         reservations.id,
         products.name AS product_name,
         products.category,
         COALESCE(parties.business_name, parties.first_name || ' ' || parties.last_name, parties.email) AS party_name,
         cities.name AS city,
         reservations.quantity,
         products.unit,
         reservations.unit_price,
         products.original_price,
         ROUND(reservations.unit_price * reservations.quantity, 2) AS total,
         ROUND(GREATEST(products.original_price - reservations.unit_price, 0) * reservations.quantity, 2) AS savings
       FROM reservations
       JOIN products ON reservations.product_id = products.id
       JOIN users AS parties ON ${partyJoin}
       LEFT JOIN cities ON cities.id = parties.city_id
       WHERE ${owner}
         AND reservations.status = 'Completed'
         AND reservations.picked_up_at::date BETWEEN $2 AND $3
       ORDER BY reservations.picked_up_at ASC, reservations.id ASC`,
      [userId, period.from, period.to],
    );

    const rows: CsvCell[][] = result.rows.map((row) => [
      row.picked_up_on,
      row.id,
      row.product_name,
      categoryLabel(lang, row.category),
      row.party_name,
      row.city,
      Number(row.quantity),
      row.unit,
      Number(row.unit_price),
      Number(row.original_price),
      Number(row.total),
      Number(row.savings),
    ]);
    // Quantities are in different units, so only the money columns are summed.
    rows.push([
      totalLabel(lang),
      null, null, null, null, null, null, null, null, null,
      sum(result.rows.map((row) => Number(row.total))),
      sum(result.rows.map((row) => Number(row.savings))),
    ]);

    const name = lang === "en" ? (role === "STORE" ? "sales" : "purchases") : role === "STORE" ? "prodaja" : "kupovine";
    return sendCsv(res, name, period, toCsv(salesHeaders(lang, role), rows));
  } catch (error) {
    console.error("Error while generating sales report:", error);
    return res.status(500).json({ error: "An error occurred while generating the report." });
  }
};

interface ImpactRow {
  month: string | null;
  pickups: string;
  partners: string;
  kg: string;
  l: string;
  pieces: string;
  value: string;
  savings: string;
}

// Food saved per month through picked-up reservations. Units are normalised like the
// dashboard's "food saved" card: g/kg as kg, ml/l as l, kom and pak as pieces.
export const getImpactReport = async (req: Request, res: Response) => {
  const { id: userId, role } = req.user!;
  const period = parsePeriod(req.query);
  if (!period) {
    return res.status(400).json({ error: "Invalid period." });
  }
  const lang = parseReportLanguage(req.query.lang);

  try {
    const { owner, partyJoin } = pickupOwnership(role);
    // GROUPING SETS adds the whole-period row (month NULL), so partners are counted
    // once across the period instead of being added up month by month.
    const result = await pool.query<ImpactRow>(
      `SELECT
         to_char(reservations.picked_up_at, 'YYYY-MM') AS month,
         COUNT(*) AS pickups,
         COUNT(DISTINCT parties.id) AS partners,
         COALESCE(SUM(CASE products.unit
           WHEN 'kg' THEN reservations.quantity
           WHEN 'g' THEN reservations.quantity / 1000 END), 0) AS kg,
         COALESCE(SUM(CASE products.unit
           WHEN 'l' THEN reservations.quantity
           WHEN 'ml' THEN reservations.quantity / 1000 END), 0) AS l,
         COALESCE(SUM(CASE WHEN products.unit IN ('kom', 'pak') THEN reservations.quantity END), 0) AS pieces,
         ROUND(SUM(reservations.unit_price * reservations.quantity), 2) AS value,
         ROUND(SUM(GREATEST(products.original_price - reservations.unit_price, 0) * reservations.quantity), 2) AS savings
       FROM reservations
       JOIN products ON reservations.product_id = products.id
       JOIN users AS parties ON ${partyJoin}
       WHERE ${owner}
         AND reservations.status = 'Completed'
         AND reservations.picked_up_at::date BETWEEN $2 AND $3
       GROUP BY GROUPING SETS ((to_char(reservations.picked_up_at, 'YYYY-MM')), ())
       ORDER BY month ASC NULLS LAST`,
      [userId, period.from, period.to],
    );

    const rows: CsvCell[][] = result.rows.map((row) => [
      row.month ?? totalLabel(lang),
      Number(row.pickups),
      Number(row.partners),
      Number(row.kg),
      Number(row.l),
      Number(row.pieces),
      Number(row.value ?? 0),
      Number(row.savings ?? 0),
    ]);

    const name = lang === "en" ? "impact" : "uticaj";
    return sendCsv(res, name, period, toCsv(impactHeaders(lang, role), rows));
  } catch (error) {
    console.error("Error while generating impact report:", error);
    return res.status(500).json({ error: "An error occurred while generating the report." });
  }
};
