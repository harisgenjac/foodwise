import type { Request, Response } from "express";
import pool from "../config/db.js";
import { isValidDate } from "../utils/dates.js";
import type { CsvCell } from "../utils/csv.js";
import { type ReportLanguage, categoryLabel, totalLabel } from "../utils/reportLabels.js";

// The report queries and helpers shared by a store's or restaurant's own reports (/api/reports)
// and the headquarters' company reports (/api/company/reports). Every report counts only
// picked-up (Completed) reservations, by the day they were picked up.

// Longest period a report may cover: one (leap) year, both days included.
export const MAX_PERIOD_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Period {
  from: string;
  to: string;
}

// Both dates are required (YYYY-MM-DD), from <= to, and at most MAX_PERIOD_DAYS long.
export const parsePeriod = (query: Request["query"]): Period | null => {
  const { from, to } = query;
  if (!isValidDate(from) || !isValidDate(to)) return null;
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (days < 1 || days > MAX_PERIOD_DAYS) return null;
  return { from, to };
};

export const sendCsv = (res: Response, name: string, period: Period, csv: string) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}-${period.from}-${period.to}.csv"`);
  return res.status(200).send(csv);
};

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

// Whose pickups a report covers. `owner` is a condition on $1 (the periods are $2 and $3);
// `partyJoin` joins the other side of the pickup as `parties`.
export interface PickupScope {
  owner: string;
  partyJoin: string;
}

// The pickups of a set of stores (a company's branches); the other party is the restaurant.
export const storesScope = (): PickupScope => ({
  owner: "products.store_id = ANY($1::int[])",
  partyJoin: "reservations.restaurant_id = parties.id",
});

// Food saved in one row: g/kg as kg, ml/l as l, kom and pak as pieces (like the dashboard's
// "food saved" card), the value paid and the savings against the original price.
export const IMPACT_COLUMNS = `
  COUNT(reservations.id) AS pickups,
  COUNT(DISTINCT parties.id) AS partners,
  COALESCE(SUM(CASE products.unit
    WHEN 'kg' THEN reservations.quantity
    WHEN 'g' THEN reservations.quantity / 1000 END), 0) AS kg,
  COALESCE(SUM(CASE products.unit
    WHEN 'l' THEN reservations.quantity
    WHEN 'ml' THEN reservations.quantity / 1000 END), 0) AS l,
  COALESCE(SUM(CASE WHEN products.unit IN ('kom', 'pak') THEN reservations.quantity END), 0) AS pieces,
  ROUND(SUM(reservations.unit_price * reservations.quantity), 2) AS value,
  ROUND(SUM(GREATEST(products.original_price - reservations.unit_price, 0) * reservations.quantity), 2) AS savings`;

export const PICKED_UP_IN_PERIOD = `reservations.status = 'Completed'
  AND reservations.picked_up_at::date BETWEEN $2 AND $3`;

interface SalesRow {
  branch_name?: string;
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

// One row per picked-up reservation in the period plus a totals row. Quantities are in different
// units, so only the money columns are summed. With `withBranch` the store's name comes first.
export const salesRows = async (
  scope: PickupScope,
  owner: number | number[],
  period: Period,
  lang: ReportLanguage,
  { withBranch = false } = {},
): Promise<CsvCell[][]> => {
  const result = await pool.query<SalesRow>(
    `SELECT
       ${withBranch ? "stores.business_name AS branch_name," : ""}
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
     JOIN users AS stores ON stores.id = products.store_id
     JOIN users AS parties ON ${scope.partyJoin}
     LEFT JOIN cities ON cities.id = parties.city_id
     WHERE ${scope.owner}
       AND ${PICKED_UP_IN_PERIOD}
     ORDER BY reservations.picked_up_at ASC, reservations.id ASC`,
    [owner, period.from, period.to],
  );

  const branch = (row: SalesRow): CsvCell[] => (withBranch ? [row.branch_name ?? null] : []);
  const rows: CsvCell[][] = result.rows.map((row) => [
    ...branch(row),
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
  rows.push([
    totalLabel(lang),
    ...Array<null>(withBranch ? 10 : 9).fill(null),
    sum(result.rows.map((row) => Number(row.total))),
    sum(result.rows.map((row) => Number(row.savings))),
  ]);
  return rows;
};

export interface ImpactTotals {
  pickups: string;
  partners: string;
  kg: string;
  l: string;
  pieces: string;
  value: string | null;
  savings: string | null;
}

interface ImpactRow extends ImpactTotals {
  month: string | null;
}

// The IMPACT_COLUMNS of a row as CSV cells.
export const impactCells = (row: ImpactTotals): CsvCell[] => [
  Number(row.pickups),
  Number(row.partners),
  Number(row.kg),
  Number(row.l),
  Number(row.pieces),
  Number(row.value ?? 0),
  Number(row.savings ?? 0),
];

// Food saved per month plus a total row. GROUPING SETS adds the whole-period row (month NULL), so
// partners are counted once across the period instead of being added up month by month.
export const impactRows = async (
  scope: PickupScope,
  owner: number | number[],
  period: Period,
  lang: ReportLanguage,
): Promise<CsvCell[][]> => {
  const result = await pool.query<ImpactRow>(
    `SELECT
       to_char(reservations.picked_up_at, 'YYYY-MM') AS month,
       ${IMPACT_COLUMNS}
     FROM reservations
     JOIN products ON reservations.product_id = products.id
     JOIN users AS parties ON ${scope.partyJoin}
     WHERE ${scope.owner}
       AND ${PICKED_UP_IN_PERIOD}
     GROUP BY GROUPING SETS ((to_char(reservations.picked_up_at, 'YYYY-MM')), ())
     ORDER BY month ASC NULLS LAST`,
    [owner, period.from, period.to],
  );
  return result.rows.map((row) => [row.month ?? totalLabel(lang), ...impactCells(row)]);
};
