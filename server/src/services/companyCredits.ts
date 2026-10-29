import type { Pool, PoolClient } from "pg";
import { creditMonth, monthEnd, nextMonth } from "../utils/creditTime.js";
import { BALANCE_SQL, balanceJoins } from "./creditService.js";
import { CREDIT_REQUEST_COLUMNS, CREDIT_REQUEST_JOINS, OPEN_REQUEST_STATUSES } from "./creditRequests.js";
import { BRANCH_STATUS } from "./branches.js";

// What the headquarters' credits page and its dashboard read: every branch's balance and the
// top-ups the branches asked the headquarters for.

export const BRANCH_REQUESTS_FROM = `FROM credit_requests ${CREDIT_REQUEST_JOINS}
  JOIN users AS branches ON branches.id = credit_requests.user_id
  WHERE branches.company_id = $1 AND branches.role = 'STORE'`;

// This month's credits of every branch (all statuses, by name; a chain has tens of branches, so
// the list is not paged) with next month's plan and the open requests, plus the company's totals.
export const listCompanyBranchCredits = async (db: Pool | PoolClient, companyId: number, now = new Date()) => {
  const periodMonth = creditMonth(now);
  const result = await db.query(
    `SELECT users.id, users.business_name, ${BRANCH_STATUS} AS status,
       ${BALANCE_SQL.planName} AS plan_name, ${BALANCE_SQL.hasSubscription} AS has_subscription,
       balance_subscriptions.auto_renew AS auto_renew,
       ${BALANCE_SQL.total} AS total, ${BALANCE_SQL.used} AS used, ${BALANCE_SQL.available} AS available,
       next_plans.name AS next_plan_name, next_subscriptions.auto_renew AS next_auto_renew
     FROM users ${balanceJoins("$1")}
     LEFT JOIN subscriptions AS next_subscriptions
       ON next_subscriptions.user_id = users.id AND next_subscriptions.period_month = $2
       AND next_subscriptions.status = 'ACTIVE'
     LEFT JOIN plans AS next_plans ON next_plans.id = next_subscriptions.plan_id
     WHERE users.company_id = $3 AND users.role = 'STORE'
     ORDER BY users.business_name ASC, users.id DESC`,
    [periodMonth, nextMonth(periodMonth), companyId],
  );
  const ids = result.rows.map((row) => row.id as number);
  const open = await db.query(
    `SELECT ${CREDIT_REQUEST_COLUMNS} FROM credit_requests ${CREDIT_REQUEST_JOINS}
     WHERE credit_requests.user_id = ANY($1::int[]) AND credit_requests.status IN ${OPEN_REQUEST_STATUSES}
     ORDER BY credit_requests.created_at DESC, credit_requests.id DESC`,
    [ids],
  );
  const branches = result.rows.map((row) => ({
    ...row,
    open_requests: open.rows.filter((request) => request.user_id === row.id),
  }));
  const totals = {
    total: branches.reduce((sum, row) => sum + row.total, 0),
    used: branches.reduce((sum, row) => sum + row.used, 0),
    available: branches.reduce((sum, row) => sum + row.available, 0),
    branches: branches.length,
    withPlan: branches.filter((row) => row.has_subscription).length,
  };
  return { periodStart: periodMonth, periodEnd: monthEnd(periodMonth), totals, branches };
};

// The top-ups the branches asked for that wait for the headquarters, oldest first. A branch has at
// most one open top-up, so the list is short and not paged.
export const listBranchTopupRequests = async (db: Pool | PoolClient, companyId: number) => {
  const result = await db.query(
    `SELECT ${CREDIT_REQUEST_COLUMNS}, branches.business_name AS branch_name
     ${BRANCH_REQUESTS_FROM} AND credit_requests.status = 'COMPANY_REVIEW'
     ORDER BY credit_requests.created_at ASC, credit_requests.id ASC`,
    [companyId],
  );
  return result.rows;
};
