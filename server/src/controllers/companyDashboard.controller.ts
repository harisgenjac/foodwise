import type { Request, Response } from "express";
import pool from "../config/db.js";
import { nextMonth } from "../utils/creditTime.js";
import { isRenewalWindow } from "../jobs/creditRenewals.js";
import { getBranchesStats } from "../services/branches.js";
import { listBranchTopupRequests, listCompanyBranchCredits } from "../services/companyCredits.js";
import { callerCompanyId, fail } from "./companyBranches.controller.js";

// The headquarters' overview: what waits for its decision, the company's totals and one row per
// branch. It only reads what the credits page and the branch pages already show: credit figures
// follow the credit month (listCompanyBranchCredits), reservations and food saved the business
// month (getBranchesStats, like the store dashboard). Deactivated and blocked branches stay in the
// rows and totals with their status, but only active branches need a plan or credits.

// From this share of the month's credits used, a branch is listed as running out.
export const LOW_CREDITS_SHARE = 0.9;

interface OpenRequest {
  request_type: string;
  period_month: string;
}

const hasOpenPlanRequest = (requests: OpenRequest[], month: string) =>
  requests.some((request) => request.request_type === "SUBSCRIPTION" && request.period_month === month);

const round = (value: number, digits: number) => Number(value.toFixed(digits));

export const getCompanyDashboard = async (req: Request, res: Response) => {
  try {
    const companyId = await callerCompanyId(req);
    const now = new Date();
    const company = await pool.query<{ id: number; name: string }>(
      "SELECT companies.id, companies.name FROM companies WHERE companies.id = $1",
      [companyId],
    );
    const credits = await listCompanyBranchCredits(pool, companyId, now);
    const ids = credits.branches.map((branch) => branch.id as number);
    const cities = await pool.query<{ id: number; city: string | null }>(
      `SELECT users.id, cities.name AS city
       FROM users LEFT JOIN cities ON cities.id = users.city_id
       WHERE users.id = ANY($1::int[])`,
      [ids],
    );
    const stats = await getBranchesStats(pool, ids);
    const topups = await listBranchTopupRequests(pool, companyId);

    const branches = credits.branches.map((branch) => ({
      id: branch.id as number,
      name: branch.business_name as string | null,
      city: cities.rows.find((row) => row.id === branch.id)?.city ?? null,
      status: branch.status as string,
      plan_name: branch.plan_name as string | null,
      has_subscription: branch.has_subscription as boolean,
      next_plan_name: branch.next_plan_name as string | null,
      has_next_subscription: branch.next_plan_name !== null,
      used: branch.used as number,
      total: branch.total as number,
      available: branch.available as number,
      open_requests: branch.open_requests,
      ...stats.get(branch.id)!,
    }));

    const periodStart = credits.periodStart;
    const nextPeriodStart = nextMonth(periodStart);
    const renewalWindow = isRenewalWindow(now);
    const active = branches.filter((branch) => branch.status === "active");
    const decisions = [
      ...topups.map((request) => ({
        type: "TOPUP_REVIEW",
        branch_id: request.user_id,
        branch_name: request.branch_name,
        request,
      })),
      ...active
        .filter((branch) => !branch.has_subscription && !hasOpenPlanRequest(branch.open_requests, periodStart))
        .map((branch) => ({ type: "NO_PLAN", branch_id: branch.id, branch_name: branch.name })),
      ...(renewalWindow ? active : [])
        .filter(
          (branch) => !branch.has_next_subscription && !hasOpenPlanRequest(branch.open_requests, nextPeriodStart),
        )
        .map((branch) => ({ type: "RENEWAL", branch_id: branch.id, branch_name: branch.name })),
      ...active
        .filter((branch) => branch.has_subscription && branch.total > 0 && branch.used / branch.total >= LOW_CREDITS_SHARE)
        .map((branch) => ({
          type: "LOW_CREDITS",
          branch_id: branch.id,
          branch_name: branch.name,
          used: branch.used,
          total: branch.total,
        })),
    ];

    const sum = (pick: (branch: (typeof branches)[number]) => number) =>
      branches.reduce((total, branch) => total + pick(branch), 0);
    const totals = {
      branches: {
        active: active.length,
        all: branches.length,
        deactivated: branches.filter((branch) => branch.status === "deactivated").length,
      },
      credits: { used: credits.totals.used, total: credits.totals.total },
      reservations: {
        total: sum((branch) => branch.reservations_this_month),
        picked_up: sum((branch) => branch.completed_this_month),
        pending: sum((branch) => branch.pending_reservations),
      },
      saved: {
        kg: round(sum((branch) => branch.saved_this_month.kg), 3),
        l: round(sum((branch) => branch.saved_this_month.l), 3),
        pieces: round(sum((branch) => branch.saved_this_month.pieces), 3),
        value: round(sum((branch) => branch.value_this_month), 2),
      },
    };

    return res.status(200).json({
      message: "Dashboard fetched successfully.",
      company: company.rows[0],
      periodStart,
      periodEnd: credits.periodEnd,
      nextPeriodStart,
      renewalWindow,
      decisions,
      totals,
      branches,
    });
  } catch (error) {
    return fail(res, error, "An error occurred while fetching the dashboard.");
  }
};
