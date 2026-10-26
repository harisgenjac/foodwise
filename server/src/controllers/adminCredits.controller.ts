import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId, parseNumber } from "../utils/params.js";
import { HttpError } from "../utils/httpError.js";
import { createNotification } from "../utils/notifications.js";
import { creditMonth, monthEnd } from "../utils/creditTime.js";
import {
  BALANCE_SQL,
  adjustCredits,
  balanceJoins,
  getBalance,
  grantPlan,
  grantTopup,
  listTransactions,
} from "../services/creditService.js";
import { REASON_ERROR, logAdminAction, parseReason } from "./admin.controller.js";
import { ADMIN_PAGE_SIZE, listPage, parsePage, parseSort } from "../utils/pagination.js";
import {
  CREDIT_REQUEST_COLUMNS,
  CREDIT_REQUEST_JOINS,
  CREDIT_REQUEST_STATUSES,
  CREDIT_REQUEST_TYPES,
} from "./credits.controller.js";

// Admin side of credits: every business's balance, the requests waiting for approval, manual
// adjustments and each user's ledger. Mounted under /api/admin/credits (admin only).

const MAX_NOTE_LENGTH = 500;
const BUSINESS_ROLES = ["STORE", "RESTAURANT"];

// An optional internal note: trimmed, empty becomes null; undefined when it is too long or not text.
const parseNote = (value: unknown): string | null | undefined => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const note = value.trim();
  if (note.length > MAX_NOTE_LENGTH) return undefined;
  return note || null;
};

// The overview's sortable columns. The balance is computed in SQL for every matching user, so a
// sort covers all pages, not only the one shown.
const OVERVIEW_SORTS = {
  used: BALANCE_SQL.used,
  available: BALANCE_SQL.available,
  total: BALANCE_SQL.total,
  usage: BALANCE_SQL.usage,
};

// Stores and restaurants with this month's plan and balance. Filters: role, q (email or business
// name), plan (a plan id, or `none` for no active subscription this month); sortable (OVERVIEW_SORTS).
export const getCreditOverview = async (req: Request, res: Response) => {
  const { role, q, plan } = req.query;
  const page = parsePage(req.query, ADMIN_PAGE_SIZE);
  const orderBy = parseSort(
    req.query,
    OVERVIEW_SORTS,
    "users.business_name ASC NULLS LAST, users.email ASC, users.id DESC",
    "users.id DESC",
  );
  // Unused filters arrive as empty strings (?role=), which mean "no filter".
  const planId = plan && plan !== "none" ? parseId(plan) : null;
  if (
    !page ||
    !orderBy ||
    (role && !BUSINESS_ROLES.includes(role as string)) ||
    (plan && plan !== "none" && planId === null)
  ) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  const now = new Date();
  const periodMonth = creditMonth(now);
  let from = `FROM users ${balanceJoins("$1")} WHERE users.role IN ('STORE', 'RESTAURANT')`;
  const values: (string | number)[] = [periodMonth];
  if (role) {
    values.push(role as string);
    from += ` AND users.role = $${values.length}`;
  }
  if (q) {
    values.push(`%${q as string}%`);
    from += ` AND (users.email ILIKE $${values.length} OR users.business_name ILIKE $${values.length})`;
  }
  if (plan === "none") {
    from += ` AND NOT (${BALANCE_SQL.hasSubscription})`;
  } else if (planId !== null) {
    values.push(planId);
    from += ` AND ${BALANCE_SQL.planId} = $${values.length}`;
  }

  try {
    const { rows: users, total } = await listPage(
      `users.id, users.email, users.role, users.business_name, users.is_blocked,
       (SELECT COUNT(*) FROM credit_requests
        WHERE credit_requests.user_id = users.id AND credit_requests.status = 'PENDING')::int AS pending_requests,
       ${BALANCE_SQL.planName} AS plan_name, ${BALANCE_SQL.hasSubscription} AS has_subscription,
       ${BALANCE_SQL.total} AS total, ${BALANCE_SQL.used} AS used, ${BALANCE_SQL.available} AS available`,
      from,
      orderBy,
      values,
      page,
    );
    return res.status(200).json({ users, total, periodStart: periodMonth, periodEnd: monthEnd(periodMonth) });
  } catch (error) {
    console.error("Error while fetching the credit overview:", error);
    return res.status(500).json({ error: "An error occurred while fetching the credit overview." });
  }
};

// Subscription and top-up requests, pending first. Filters: type, status, user_id.
export const getCreditRequests = async (req: Request, res: Response) => {
  const { type, status, user_id } = req.query;
  const page = parsePage(req.query, ADMIN_PAGE_SIZE);
  if (
    !page ||
    (type && !CREDIT_REQUEST_TYPES.includes(type as string)) ||
    (status && !CREDIT_REQUEST_STATUSES.includes(status as string))
  ) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  let from = `FROM credit_requests ${CREDIT_REQUEST_JOINS}
    JOIN users AS requesters ON credit_requests.user_id = requesters.id
    LEFT JOIN users AS reviewers ON credit_requests.reviewed_by = reviewers.id
    WHERE true`;
  const values: (string | number)[] = [];
  if (type) {
    values.push(type as string);
    from += ` AND credit_requests.request_type = $${values.length}`;
  }
  if (status) {
    values.push(status as string);
    from += ` AND credit_requests.status = $${values.length}`;
  }
  if (user_id) {
    const id = parseId(user_id);
    if (id === null) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    values.push(id);
    from += ` AND credit_requests.user_id = $${values.length}`;
  }

  try {
    const { rows, total } = await listPage(
      `${CREDIT_REQUEST_COLUMNS}, credit_requests.admin_note,
       requesters.email AS user_email, requesters.business_name AS user_business_name,
       requesters.role AS user_role, reviewers.email AS reviewed_by_email`,
      from,
      `CASE WHEN credit_requests.status = 'PENDING' THEN 0 ELSE 1 END,
       credit_requests.created_at DESC, credit_requests.id DESC`,
      values,
      page,
    );
    return res.status(200).json({ requests: rows, total });
  } catch (error) {
    console.error("Error while fetching credit requests:", error);
    return res.status(500).json({ error: "An error occurred while fetching credit requests." });
  }
};

// For the admin sidebar badge.
export const getPendingRequestCount = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS count FROM credit_requests WHERE status = 'PENDING'",
    );
    return res.status(200).json({ count: result.rows[0].count });
  } catch (error) {
    console.error("Error while counting credit requests:", error);
    return res.status(500).json({ error: "An error occurred while counting credit requests." });
  }
};

// Approve or reject a pending request with an optional internal note. Approval grants the
// credits through creditService in the same transaction that closes the request, writes the
// audit log and tells the user (without the note).
const decideRequest = (decision: "APPROVED" | "REJECTED") => async (req: Request, res: Response) => {
  const requestId = parseId(req.params.id);
  if (requestId === null) {
    return res.status(404).json({ error: "Request not found." });
  }
  const note = parseNote(req.body.note);
  if (note === undefined) {
    return res.status(400).json({ error: `The note can be at most ${MAX_NOTE_LENGTH} characters long.` });
  }
  const adminId = req.user!.id;

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // Locked so a withdrawal, the expiry job or a second admin cannot decide it at the same time.
    const locked = await client.query(
      `SELECT credit_requests.id, credit_requests.user_id, credit_requests.request_type,
              credit_requests.plan_id, credit_requests.topup_package_id, credit_requests.period_month,
              credit_requests.auto_renew, credit_requests.status, credit_requests.credits
       FROM credit_requests WHERE credit_requests.id = $1 FOR UPDATE`,
      [requestId],
    );
    const request = locked.rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Request not found." });
    }
    if (request.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Only pending requests can be approved or rejected." });
    }

    const by = { actor: "ADMIN" as const, userId: adminId };
    if (decision === "APPROVED") {
      if (request.request_type === "SUBSCRIPTION") {
        await grantPlan(client, {
          userId: request.user_id,
          planId: request.plan_id,
          periodMonth: request.period_month,
          autoRenew: request.auto_renew,
          // What the user was quoted, even if the plan changed since.
          credits: request.credits,
          requestId,
          by,
        });
      } else {
        // A top-up belongs to the month it was asked for; after that month its credits would
        // land in a month the user did not pay for.
        if (request.period_month !== creditMonth(new Date())) {
          throw new HttpError(400, "This month has already ended.");
        }
        await grantTopup(client, {
          userId: request.user_id,
          packageId: request.topup_package_id,
          credits: request.credits,
          requestId,
          by,
        });
      }
    }

    await client.query(
      `UPDATE credit_requests
       SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4`,
      [decision, note, adminId, requestId],
    );
    await logAdminAction(client, {
      adminId,
      action: decision === "APPROVED" ? "APPROVE_CREDIT_REQUEST" : "REJECT_CREDIT_REQUEST",
      targetUserId: request.user_id,
      targetCreditRequestId: requestId,
      reason: note,
    });
    const kind = request.request_type === "SUBSCRIPTION" ? "subscription" : "top-up";
    await createNotification(client, {
      userId: request.user_id,
      type: decision === "APPROVED" ? "CREDIT_REQUEST_APPROVED" : "CREDIT_REQUEST_REJECTED",
      message: `Your ${kind} request was ${decision === "APPROVED" ? "approved" : "rejected"}.`,
      creditRequestId: requestId,
    });
    await client.query("COMMIT");
    return res.status(200).json({
      message: decision === "APPROVED" ? "Request approved." : "Request rejected.",
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error instanceof HttpError) {
      return res.status(error.status).json(error.body());
    }
    console.error("Error while deciding a credit request:", error);
    return res.status(500).json({ error: "An error occurred while processing the request." });
  } finally {
    if (client) client.release();
  }
};

export const approveCreditRequest = decideRequest("APPROVED");
export const rejectCreditRequest = decideRequest("REJECTED");

// Looks up a business account for the per-user credit routes; null with the response sent.
const findBusinessUser = async (req: Request, res: Response) => {
  const userId = parseId(req.params.id);
  const user = userId === null
    ? undefined
    : (await pool.query("SELECT users.id, users.role FROM users WHERE users.id = $1", [userId])).rows[0];
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return null;
  }
  if (!BUSINESS_ROLES.includes(user.role)) {
    res.status(400).json({ error: "Credits apply only to stores and restaurants." });
    return null;
  }
  return user.id as number;
};

// Manual +/− correction into the current month, with a required reason (audit log and ledger).
export const adjustUserCredits = async (req: Request, res: Response) => {
  const amount = parseNumber(req.body.amount);
  if (amount === null || !Number.isInteger(amount) || amount === 0) {
    return res.status(400).json({ error: "Amount must be a whole number other than zero." });
  }
  const reason = parseReason(req.body.reason);
  if (!reason) {
    return res.status(400).json({ error: REASON_ERROR });
  }

  let client;
  try {
    const userId = await findBusinessUser(req, res);
    if (userId === null) return;
    client = await pool.connect();
    await client.query("BEGIN");
    const transaction = await adjustCredits(client, {
      userId,
      amount,
      reason,
      by: { actor: "ADMIN", userId: req.user!.id },
    });
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "ADJUST_CREDITS",
      targetUserId: userId,
      reason: `${amount > 0 ? "+" : ""}${amount}: ${reason}`,
    });
    await client.query("COMMIT");
    return res.status(200).json({
      message: "Credits adjusted.",
      transaction,
      balance: await getBalance(pool, userId),
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error instanceof HttpError) {
      return res.status(error.status).json(error.body());
    }
    console.error("Error while adjusting credits:", error);
    return res.status(500).json({ error: "An error occurred while adjusting credits." });
  } finally {
    if (client) client.release();
  }
};

// One user's ledger, newest first, with this month's balance.
export const getUserLedger = async (req: Request, res: Response) => {
  const page = parsePage(req.query, ADMIN_PAGE_SIZE);
  if (!page) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    const userId = await findBusinessUser(req, res);
    if (userId === null) return;
    const { transactions, total } = await listTransactions(pool, userId, page);
    return res.status(200).json({ transactions, total, balance: await getBalance(pool, userId) });
  } catch (error) {
    console.error("Error while fetching the credit ledger:", error);
    return res.status(500).json({ error: "An error occurred while fetching the credit ledger." });
  }
};
