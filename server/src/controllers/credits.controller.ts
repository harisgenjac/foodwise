import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId, parseNonNegativeInt } from "../utils/params.js";
import { TABLE_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import { isUniqueViolation } from "../utils/accounts.js";
import { creditMonth, nextMonth } from "../utils/creditTime.js";
import { notifyAdminsOfCreditRequest } from "../utils/notifications.js";
import { createRenewals, isRenewalWindow } from "../jobs/creditRenewals.js";
import { findActiveSubscription, getBalance, getUsageHistory } from "../services/creditService.js";

// Stores and restaurants: their credits, plans and the requests they send to an admin.
// Payment is offline for now, so every subscription and top-up is a request an admin approves.

export const CREDIT_REQUEST_TYPES = ["SUBSCRIPTION", "TOPUP"];
export const CREDIT_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"];

// What a user may see of a request. admin_note is internal and is never selected here.
export const CREDIT_REQUEST_COLUMNS = `credit_requests.id, credit_requests.user_id, credit_requests.request_type,
  credit_requests.plan_id, credit_requests.topup_package_id, credit_requests.period_month,
  credit_requests.auto_renew, credit_requests.status, credit_requests.source,
  credit_requests.created_at, credit_requests.reviewed_at,
  plans.name AS plan_name, credit_requests.credits, credit_requests.price`;
export const CREDIT_REQUEST_JOINS = `
  LEFT JOIN plans ON credit_requests.plan_id = plans.id
  LEFT JOIN topup_packages ON credit_requests.topup_package_id = topup_packages.id`;

const findRequest = async (requestId: number) => {
  const result = await pool.query(
    `SELECT ${CREDIT_REQUEST_COLUMNS} FROM credit_requests ${CREDIT_REQUEST_JOINS}
     WHERE credit_requests.id = $1`,
    [requestId],
  );
  return result.rows[0];
};

export const getPlans = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, credits_per_period, price FROM plans
       WHERE is_active ORDER BY credits_per_period`,
    );
    return res.status(200).json({ plans: result.rows });
  } catch (error) {
    console.error("Error while fetching plans:", error);
    return res.status(500).json({ error: "An error occurred while fetching plans." });
  }
};

export const getTopupPackages = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, credits, price FROM topup_packages
       WHERE is_active ORDER BY credits`,
    );
    return res.status(200).json({ packages: result.rows });
  } catch (error) {
    console.error("Error while fetching top-up packages:", error);
    return res.status(500).json({ error: "An error occurred while fetching top-up packages." });
  }
};

// The profile's subscription section and the banners: this month's balance, next month's
// subscription (a plan change or an approved renewal) and the pending requests.
export const getMyCredits = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const now = new Date();
    const balance = await getBalance(pool, userId, now);
    const nextSubscription = await findActiveSubscription(pool, userId, nextMonth(creditMonth(now)));
    const pending = await pool.query(
      `SELECT ${CREDIT_REQUEST_COLUMNS} FROM credit_requests ${CREDIT_REQUEST_JOINS}
       WHERE credit_requests.user_id = $1 AND credit_requests.status = 'PENDING'
       ORDER BY credit_requests.created_at DESC`,
      [userId],
    );
    return res.status(200).json({
      credits: { ...balance, nextSubscription, pendingRequests: pending.rows },
    });
  } catch (error) {
    console.error("Error while fetching credits:", error);
    return res.status(500).json({ error: "An error occurred while fetching credits." });
  }
};

// The user's requests in every status, newest first and in pages, so they can follow what the
// admin decided.
export const getMyRequests = async (req: Request, res: Response) => {
  const page = parsePage(req.query, TABLE_PAGE_SIZE);
  if (!page) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    const { rows, total } = await listPage(
      CREDIT_REQUEST_COLUMNS,
      `FROM credit_requests ${CREDIT_REQUEST_JOINS} WHERE credit_requests.user_id = $1`,
      "credit_requests.created_at DESC, credit_requests.id DESC",
      [req.user!.id],
      page,
    );
    return res.status(200).json({ requests: rows, total });
  } catch (error) {
    console.error("Error while fetching credit requests:", error);
    return res.status(500).json({ error: "An error occurred while fetching credit requests." });
  }
};

// The Credits page: usage per month and per category for one year (default: the current one).
export const getMyHistory = async (req: Request, res: Response) => {
  const year = req.query.year === undefined ? Number(creditMonth(new Date()).slice(0, 4)) : parseNonNegativeInt(req.query.year);
  if (year === null || year < 2000 || year > 2100) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    const history = await getUsageHistory(pool, req.user!.id, year);
    return res.status(200).json({ history });
  } catch (error) {
    console.error("Error while fetching credit history:", error);
    return res.status(500).json({ error: "An error occurred while fetching the credit history." });
  }
};

// A subscription for this month (only while there is none) or the next one (a plan change or
// an early renewal), or a top-up for this month (only with an active subscription). One pending
// subscription request per month and one pending top-up are enforced by unique indexes.
export const createRequest = async (req: Request, res: Response) => {
  const { request_type, plan_id, topup_package_id, period, auto_renew } = req.body;
  if (!CREDIT_REQUEST_TYPES.includes(request_type)) {
    return res.status(400).json({ error: "Request type is not valid." });
  }
  const userId = req.user!.id;
  const currentMonth = creditMonth(new Date());

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    let requestId: number;
    if (request_type === "SUBSCRIPTION") {
      if (period !== "current" && period !== "next") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Period is not valid." });
      }
      if (auto_renew !== undefined && typeof auto_renew !== "boolean") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Auto-renew must be true or false." });
      }
      const planId = parseId(plan_id);
      const plan = planId === null
        ? undefined
        : (await client.query("SELECT id FROM plans WHERE id = $1 AND is_active", [planId])).rows[0];
      if (!plan) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Plan not found." });
      }
      const periodMonth = period === "current" ? currentMonth : nextMonth(currentMonth);
      if (await findActiveSubscription(client, userId, periodMonth)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "You already have a subscription for this month." });
      }
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO credit_requests (user_id, request_type, plan_id, period_month, auto_renew)
         VALUES ($1, 'SUBSCRIPTION', $2, $3, $4)
         RETURNING id`,
        [userId, plan.id, periodMonth, auto_renew === true],
      );
      requestId = inserted.rows[0]!.id;
    } else {
      const packageId = parseId(topup_package_id);
      const topupPackage = packageId === null
        ? undefined
        : (await client.query("SELECT id FROM topup_packages WHERE id = $1 AND is_active", [packageId])).rows[0];
      if (!topupPackage) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Top-up package not found." });
      }
      // Extra credits extend this month's plan, so there must be one.
      if (!(await findActiveSubscription(client, userId, currentMonth))) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "An active subscription for the current month is required to buy extra credits." });
      }
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO credit_requests (user_id, request_type, topup_package_id, period_month)
         VALUES ($1, 'TOPUP', $2, $3)
         RETURNING id`,
        [userId, topupPackage.id, currentMonth],
      );
      requestId = inserted.rows[0]!.id;
    }

    await notifyAdminsOfCreditRequest(
      client,
      requestId,
      `New ${request_type === "SUBSCRIPTION" ? "subscription" : "top-up"} request waiting for approval.`,
    );
    await client.query("COMMIT");
    return res.status(201).json({ message: "Request sent.", request: await findRequest(requestId) });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      return res.status(400).json({
        error: request_type === "SUBSCRIPTION"
          ? "You already have a pending subscription request for this month."
          : "You already have a pending top-up request.",
      });
    }
    console.error("Error while creating credit request:", error);
    return res.status(500).json({ error: "An error occurred while sending the request." });
  } finally {
    if (client) client.release();
  }
};

// The user withdraws a request the admin has not decided yet.
export const withdrawRequest = async (req: Request, res: Response) => {
  const requestId = parseId(req.params.id);
  if (requestId === null) {
    return res.status(404).json({ error: "Request not found." });
  }
  try {
    // The status condition makes this safe against an admin deciding at the same moment.
    const result = await pool.query(
      `UPDATE credit_requests SET status = 'CANCELLED'
       WHERE id = $1 AND user_id = $2 AND status = 'PENDING'
       RETURNING id`,
      [requestId, req.user!.id],
    );
    if (result.rows.length === 0) {
      const existing = await pool.query("SELECT user_id FROM credit_requests WHERE id = $1", [requestId]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: "Request not found." });
      }
      if (existing.rows[0].user_id !== req.user!.id) {
        return res.status(403).json({ error: "You are not allowed to withdraw this request." });
      }
      return res.status(400).json({ error: "Only pending requests can be withdrawn." });
    }
    return res.status(200).json({ message: "Request withdrawn.", request: await findRequest(requestId) });
  } catch (error) {
    console.error("Error while withdrawing credit request:", error);
    return res.status(500).json({ error: "An error occurred while withdrawing the request." });
  }
};

// Auto-renew is set on the user's current and future subscriptions and on their pending
// subscription requests (their own and the job's renewals), so an approval later never turns
// it back on. Next month's plan stays either way: an approved one is kept, a request still waits.
// Turned on in the renewal window, the renewal is created at once: the job may already have run
// for the last time this month. `renewalCreated` tells the client.
export const setAutoRenew = async (req: Request, res: Response) => {
  const { auto_renew } = req.body;
  if (typeof auto_renew !== "boolean") {
    return res.status(400).json({ error: "Auto-renew must be true or false." });
  }
  const userId = req.user!.id;
  const now = new Date();
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE subscriptions SET auto_renew = $1
       WHERE user_id = $2 AND status = 'ACTIVE' AND period_month >= $3
       RETURNING id`,
      [auto_renew, userId, creditMonth(now)],
    );
    if (updated.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "You do not have an active subscription." });
    }
    await client.query(
      `UPDATE credit_requests SET auto_renew = $1
       WHERE user_id = $2 AND status = 'PENDING' AND request_type = 'SUBSCRIPTION'`,
      [auto_renew, userId],
    );
    const renewals = auto_renew && isRenewalWindow(now)
      ? await createRenewals(client, now, { userId, explicit: true })
      : [];
    await client.query("COMMIT");
    return res.status(200).json({
      message: auto_renew ? "Auto-renew turned on." : "Auto-renew turned off.",
      autoRenew: auto_renew,
      renewalCreated: renewals.length > 0,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while changing auto-renew:", error);
    return res.status(500).json({ error: "An error occurred while changing auto-renew." });
  } finally {
    if (client) client.release();
  }
};
