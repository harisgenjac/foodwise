import type { Request, Response } from "express";
import pool from "../config/db.js";
import { toCsv, type CsvCell } from "../utils/csv.js";
import {
  type ReportLanguage,
  branchStatusLabel,
  branchesHeaders,
  companyImpactHeaders,
  companySalesHeaders,
  parseReportLanguage,
  totalLabel,
} from "../utils/reportLabels.js";
import {
  IMPACT_COLUMNS,
  PICKED_UP_IN_PERIOD,
  type ImpactTotals,
  type Period,
  impactCells,
  impactRows,
  parsePeriod,
  salesRows,
  sendCsv,
  storesScope,
} from "../services/reports.js";
import { BRANCH_NOT_FOUND, BRANCH_STATUS, findCompanyBranch } from "../services/branches.js";
import { callerCompanyId } from "./companyBranches.controller.js";

// The headquarters' reports over its branches, with the rules of a store's own reports
// (/api/reports): the same period limits, language, CSV format and errors. Deactivated branches
// are included, since their history stays. `branch_id` narrows a report to one of the company's
// branches; any other id answers 404.

interface CompanyReport {
  fileName: Record<ReportLanguage, string>;
  headers: (lang: ReportLanguage) => string[];
  rows: (branchIds: number[], period: Period, lang: ReportLanguage) => Promise<CsvCell[][]>;
}

const companyReport = (report: CompanyReport) => async (req: Request, res: Response) => {
  const period = parsePeriod(req.query);
  if (!period) {
    return res.status(400).json({ error: "Invalid period." });
  }
  const lang = parseReportLanguage(req.query.lang);

  try {
    const companyId = await callerCompanyId(req);
    let branchIds: number[];
    if (req.query.branch_id !== undefined) {
      const branch = await findCompanyBranch(pool, companyId, req.query.branch_id);
      if (!branch) {
        return res.status(404).json({ error: BRANCH_NOT_FOUND });
      }
      branchIds = [branch.id];
    } else {
      const branches = await pool.query<{ id: number }>(
        "SELECT users.id FROM users WHERE users.company_id = $1 AND users.role = 'STORE'",
        [companyId],
      );
      branchIds = branches.rows.map((row) => row.id);
    }
    const rows = await report.rows(branchIds, period, lang);
    return sendCsv(res, report.fileName[lang], period, toCsv(report.headers(lang), rows));
  } catch (error) {
    console.error("Error while generating company report:", error);
    return res.status(500).json({ error: "An error occurred while generating the report." });
  }
};

// Every pickup of the branches, with the branch first.
export const getCompanySalesReport = companyReport({
  fileName: { bs: "prodaja-firma", en: "company-sales" },
  headers: companySalesHeaders,
  rows: (branchIds, period, lang) => salesRows(storesScope(), branchIds, period, lang, { withBranch: true }),
});

// Food saved per month across the branches; partners are the distinct restaurants of the company.
export const getCompanyImpactReport = companyReport({
  fileName: { bs: "uticaj-firma", en: "company-impact" },
  headers: companyImpactHeaders,
  rows: (branchIds, period, lang) => impactRows(storesScope(), branchIds, period, lang),
});

interface BranchReportRow extends ImpactTotals {
  is_total: number;
  branch_name: string | null;
  status: string;
}

// One row per branch (also those without pickups) plus a total row, where partners are counted
// once across the branches.
export const getCompanyBranchesReport = companyReport({
  fileName: { bs: "poslovnice", en: "branches" },
  headers: branchesHeaders,
  rows: async (branchIds, period, lang) => {
    const result = await pool.query<BranchReportRow>(
      `SELECT GROUPING(users.id) AS is_total, users.business_name AS branch_name, ${BRANCH_STATUS} AS status,
         ${IMPACT_COLUMNS}
       FROM users
       LEFT JOIN (reservations
         JOIN products ON reservations.product_id = products.id
         JOIN users AS parties ON reservations.restaurant_id = parties.id)
         ON products.store_id = users.id AND ${PICKED_UP_IN_PERIOD}
       WHERE users.id = ANY($1::int[])
       GROUP BY GROUPING SETS ((users.id, users.business_name, users.deactivated_at, users.is_blocked), ())
       ORDER BY GROUPING(users.id) ASC, users.business_name ASC, users.id ASC`,
      [branchIds, period.from, period.to],
    );
    return result.rows.map((row) =>
      row.is_total
        ? [totalLabel(lang), null, ...impactCells(row)]
        : [row.branch_name, branchStatusLabel(lang, row.status), ...impactCells(row)],
    );
  },
});
