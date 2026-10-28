import type { Pool, PoolClient } from "pg";
import { HttpError } from "../utils/httpError.js";
import { parseId } from "../utils/params.js";
import { isUniqueViolation } from "../utils/accounts.js";
import { creditMonth, nextMonth } from "../utils/creditTime.js";
import { createRenewals, isRenewalWindow } from "../jobs/creditRenewals.js";
import { findActiveSubscription, getBalance } from "./creditService.js";

// Subscription and top-up requests, shared by a store's or restaurant's own endpoints and by a
// company's headquarters acting for its branches. Payment is offline for now, so every request is
// approved by an admin. A branch's plan and top-ups are asked for by its headquarters; the branch
// can only ask its headquarters for a top-up (COMPANY_REVIEW), which the headquarters forwards to
// the admin (PENDING) or rejects (COMPANY_REJECTED). These functions run in the caller's
// transaction and throw HttpError for the API answers.

type Db = Pool | PoolClient;

export const CREDIT_REQUEST_TYPES = ["SUBSCRIPTION", "TOPUP"];
// Every status a store, restaurant or headquarters may see.
export const CREDIT_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "COMPANY_REVIEW",
  "COMPANY_REJECTED",
];
// The statuses of requests that reached an admin (the admin's status filter).
export const ADMIN_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"];
// Still open: waiting for the headquarters or for an admin.
export const OPEN_REQUEST_STATUSES = "('PENDING', 'COMPANY_REVIEW')";

// A branch's own top-up request reaches an admin only once its headquarters forwarded it; one that
// waits for the headquarters, was rejected or withdrawn there, or expired before, never does.
export const REACHED_ADMIN = `(credit_requests.source <> 'BRANCH'
  OR (credit_requests.company_reviewed_at IS NOT NULL AND credit_requests.status <> 'COMPANY_REJECTED'))`;

export const COMPANY_MANAGES_PLAN = "Your company manages your plan.";

// What a user (and a headquarters) may see of a request. admin_note is internal and is never
// selected here; company_note is the headquarters' note to its branch.
export const CREDIT_REQUEST_COLUMNS = `credit_requests.id, credit_requests.user_id, credit_requests.request_type,
  credit_requests.plan_id, credit_requests.topup_package_id, credit_requests.period_month,
  credit_requests.auto_renew, credit_requests.status, credit_requests.source,
  credit_requests.created_at, credit_requests.reviewed_at, credit_requests.requested_by,
  credit_requests.company_note, credit_requests.company_reviewed_at,
  plans.name AS plan_name, credit_requests.credits, credit_requests.price`;
export const CREDIT_REQUEST_JOINS = `
  LEFT JOIN plans ON credit_requests.plan_id = plans.id
  LEFT JOIN topup_packages ON credit_requests.topup_package_id = topup_packages.id`;

export const findRequest = async (db: Db, requestId: number) => {
  const result = await db.query(
    `SELECT ${CREDIT_REQUEST_COLUMNS} FROM credit_requests ${CREDIT_REQUEST_JOINS}
     WHERE credit_requests.id = $1`,
    [requestId],
  );
  return result.rows[0];
};

// The company whose headquarters manages the user's plan: set for a branch (a STORE with a
// company), null for an independent store and a restaurant.
export const getManagingCompany = async (db: Db, userId: number) => {
  const result = await db.query<{ id: number; name: string }>(
    `SELECT companies.id, companies.name
     FROM users JOIN companies ON companies.id = users.company_id
     WHERE users.id = $1 AND users.role = 'STORE'`,
    [userId],
  );
  return result.rows[0] ?? null;
};

// The profile's subscription section and the banners: this month's balance, next month's
// subscription (a plan change or an approved renewal), the open requests and, for a branch, the
// company that manages its plan.
export const creditSummary = async (db: Db, userId: number, now = new Date()) => {
  // Sequential: `db` may be a transaction client, which runs one query at a time.
  const balance = await getBalance(db, userId, now);
  const nextSubscription = await findActiveSubscription(db, userId, nextMonth(creditMonth(now)));
  const open = await db.query(
    `SELECT ${CREDIT_REQUEST_COLUMNS} FROM credit_requests ${CREDIT_REQUEST_JOINS}
     WHERE credit_requests.user_id = $1 AND credit_requests.status IN ${OPEN_REQUEST_STATUSES}
     ORDER BY credit_requests.created_at DESC, credit_requests.id DESC`,
    [userId],
  );
  const company = await getManagingCompany(db, userId);
  return {
    ...balance,
    nextSubscription,
    pendingRequests: open.rows,
    managedByCompany: company !== null,
    companyName: company?.name ?? null,
  };
};

export interface RequestBody {
  request_type?: unknown;
  plan_id?: unknown;
  topup_package_id?: unknown;
  period?: unknown;
  auto_renew?: unknown;
}

// A subscription for this month (only while there is none) or the next one (a plan change or an
// early renewal), or a top-up for this month (only with an active subscription). One pending
// subscription request per month and one open top-up (waiting for the headquarters or an admin)
// are enforced by unique indexes. `userId` is whose credits it is for, `requestedBy` who sent it
// (the user, or the headquarters for its branch). A branch's own top-up starts as COMPANY_REVIEW.
export const createCreditRequest = async (
  client: PoolClient,
  body: RequestBody,
  {
    userId,
    requestedBy,
    source,
    status = "PENDING",
  }: {
    userId: number;
    requestedBy: number;
    source: "USER" | "COMPANY" | "BRANCH";
    status?: "PENDING" | "COMPANY_REVIEW";
  },
  now = new Date(),
): Promise<number> => {
  const { request_type, plan_id, topup_package_id, period, auto_renew } = body;
  if (typeof request_type !== "string" || !CREDIT_REQUEST_TYPES.includes(request_type)) {
    throw new HttpError(400, "Request type is not valid.");
  }
  const currentMonth = creditMonth(now);
  try {
    if (request_type === "SUBSCRIPTION") {
      if (period !== "current" && period !== "next") {
        throw new HttpError(400, "Period is not valid.");
      }
      if (auto_renew !== undefined && typeof auto_renew !== "boolean") {
        throw new HttpError(400, "Auto-renew must be true or false.");
      }
      const planId = parseId(plan_id);
      const plan = planId === null
        ? undefined
        : (await client.query("SELECT id FROM plans WHERE id = $1 AND is_active", [planId])).rows[0];
      if (!plan) {
        throw new HttpError(404, "Plan not found.");
      }
      const periodMonth = period === "current" ? currentMonth : nextMonth(currentMonth);
      if (await findActiveSubscription(client, userId, periodMonth)) {
        throw new HttpError(400, "You already have a subscription for this month.");
      }
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO credit_requests (user_id, request_type, plan_id, period_month, auto_renew, source, requested_by, status)
         VALUES ($1, 'SUBSCRIPTION', $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [userId, plan.id, periodMonth, auto_renew === true, source, requestedBy, status],
      );
      return inserted.rows[0]!.id;
    }

    const packageId = parseId(topup_package_id);
    const topupPackage = packageId === null
      ? undefined
      : (await client.query("SELECT id FROM topup_packages WHERE id = $1 AND is_active", [packageId])).rows[0];
    if (!topupPackage) {
      throw new HttpError(404, "Top-up package not found.");
    }
    // Extra credits extend this month's plan, so there must be one.
    if (!(await findActiveSubscription(client, userId, currentMonth))) {
      throw new HttpError(400, "An active subscription for the current month is required to buy extra credits.");
    }
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO credit_requests (user_id, request_type, topup_package_id, period_month, source, requested_by, status)
       VALUES ($1, 'TOPUP', $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, topupPackage.id, currentMonth, source, requestedBy, status],
    );
    return inserted.rows[0]!.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(
        400,
        request_type === "SUBSCRIPTION"
          ? "You already have a pending subscription request for this month."
          : "You already have a pending top-up request.",
      );
    }
    throw error;
  }
};

// Auto-renew is set on the user's current and future subscriptions and on their pending
// subscription requests (their own and the job's renewals), so an approval later never turns
// it back on. Next month's plan stays either way: an approved one is kept, a request still waits.
// Turned on in the renewal window, the renewal is created at once: the job may already have run
// for the last time this month. Null when the user has no current or future subscription.
export const applyAutoRenew = async (client: PoolClient, userId: number, autoRenew: boolean, now = new Date()) => {
  const updated = await client.query(
    `UPDATE subscriptions SET auto_renew = $1
     WHERE user_id = $2 AND status = 'ACTIVE' AND period_month >= $3
     RETURNING id`,
    [autoRenew, userId, creditMonth(now)],
  );
  if (updated.rows.length === 0) return null;
  await client.query(
    `UPDATE credit_requests SET auto_renew = $1
     WHERE user_id = $2 AND status = 'PENDING' AND request_type = 'SUBSCRIPTION'`,
    [autoRenew, userId],
  );
  const renewals = autoRenew && isRenewalWindow(now)
    ? await createRenewals(client, now, { userId, explicit: true })
    : [];
  return { renewalCreated: renewals.length > 0 };
};

// A deactivated branch stops asking for credits: its open requests (waiting for the headquarters
// or an admin) are withdrawn and auto-renew is turned off on its current and future
// subscriptions, so the renewal job does not renew it. Reactivation leaves both as they are.
export const closeBranchCredits = async (client: PoolClient, branchId: number, now = new Date()) => {
  const withdrawn = await client.query(
    `UPDATE credit_requests SET status = 'CANCELLED'
     WHERE user_id = $1 AND status IN ${OPEN_REQUEST_STATUSES}
     RETURNING id`,
    [branchId],
  );
  await client.query(
    `UPDATE subscriptions SET auto_renew = false
     WHERE user_id = $1 AND status = 'ACTIVE' AND period_month >= $2`,
    [branchId, creditMonth(now)],
  );
  return withdrawn.rows.length;
};
