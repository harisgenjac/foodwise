import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId, parseNonNegativeInt } from "../utils/params.js";
import { TABLE_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import { HttpError } from "../utils/httpError.js";
import { creditMonth } from "../utils/creditTime.js";
import { notifyAdminsOfCreditRequest, notifyCompanyHqOfCredit } from "../utils/notifications.js";
import { getUsageHistory } from "../services/creditService.js";
import {
  COMPANY_MANAGES_PLAN,
  CREDIT_REQUEST_COLUMNS,
  CREDIT_REQUEST_JOINS,
  applyAutoRenew,
  createCreditRequest,
  creditSummary,
  findRequest,
  getManagingCompany,
} from "../services/creditRequests.js";

// Stores and restaurants: their credits, plans and the requests they send to an admin.
// Payment is offline for now, so every subscription and top-up is a request an admin approves.
// A branch (a store of a company) does not choose its plan: its headquarters asks and pays for it
// (companyCredits.controller.ts). The branch can only ask its headquarters for extra credits.

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

export const getMyCredits = async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ credits: await creditSummary(pool, req.user!.id) });
  } catch (error) {
    console.error("Error while fetching credits:", error);
    return res.status(500).json({ error: "An error occurred while fetching credits." });
  }
};

// The user's requests in every status, newest first and in pages, so they can follow what the
// admin (and for a branch, its headquarters) decided.
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

// The rules are in createCreditRequest. A branch cannot ask for a plan (its headquarters does);
// its top-up goes to its headquarters first instead of an admin.
export const createRequest = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const company = await getManagingCompany(client, userId);
    if (company && req.body.request_type === "SUBSCRIPTION") {
      throw new HttpError(403, COMPANY_MANAGES_PLAN);
    }

    let requestId: number;
    let message: string;
    if (company) {
      requestId = await createCreditRequest(client, req.body, {
        userId,
        requestedBy: userId,
        source: "BRANCH",
        status: "COMPANY_REVIEW",
      });
      await notifyCompanyHqOfCredit(client, requestId, "BRANCH_TOPUP_REQUESTED", "A branch asks for extra credits.");
      message = "Request sent to your company.";
    } else {
      requestId = await createCreditRequest(client, req.body, { userId, requestedBy: userId, source: "USER" });
      await notifyAdminsOfCreditRequest(
        client,
        requestId,
        `New ${req.body.request_type === "SUBSCRIPTION" ? "subscription" : "top-up"} request waiting for approval.`,
      );
      message = "Request sent.";
    }
    await client.query("COMMIT");
    return res.status(201).json({ message, request: await findRequest(pool, requestId) });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error instanceof HttpError) {
      return res.status(error.status).json(error.body());
    }
    console.error("Error while creating credit request:", error);
    return res.status(500).json({ error: "An error occurred while sending the request." });
  } finally {
    if (client) client.release();
  }
};

// The user withdraws a request the admin has not decided yet. A branch withdraws only a top-up
// that still waits for its headquarters; what the headquarters sent to the admin is theirs.
export const withdrawRequest = async (req: Request, res: Response) => {
  const requestId = parseId(req.params.id);
  if (requestId === null) {
    return res.status(404).json({ error: "Request not found." });
  }
  try {
    const userId = req.user!.id;
    const company = await getManagingCompany(pool, userId);
    // The status condition makes this safe against an admin (or the headquarters) deciding at the same moment.
    const result = await pool.query(
      `UPDATE credit_requests SET status = 'CANCELLED'
       WHERE id = $1 AND user_id = $2 AND status = $3
       RETURNING id`,
      [requestId, userId, company ? "COMPANY_REVIEW" : "PENDING"],
    );
    if (result.rows.length === 0) {
      const existing = await pool.query("SELECT user_id, status FROM credit_requests WHERE id = $1", [requestId]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: "Request not found." });
      }
      if (existing.rows[0].user_id !== userId) {
        return res.status(403).json({ error: "You are not allowed to withdraw this request." });
      }
      if (company && existing.rows[0].status === "PENDING") {
        return res.status(403).json({ error: COMPANY_MANAGES_PLAN });
      }
      return res.status(400).json({ error: "Only pending requests can be withdrawn." });
    }
    return res.status(200).json({ message: "Request withdrawn.", request: await findRequest(pool, requestId) });
  } catch (error) {
    console.error("Error while withdrawing credit request:", error);
    return res.status(500).json({ error: "An error occurred while withdrawing the request." });
  }
};

// The rules are in applyAutoRenew; `renewalCreated` tells the client that the switch created the
// renewal at once. A branch's auto-renew is its headquarters' choice.
export const setAutoRenew = async (req: Request, res: Response) => {
  const { auto_renew } = req.body;
  if (typeof auto_renew !== "boolean") {
    return res.status(400).json({ error: "Auto-renew must be true or false." });
  }
  const userId = req.user!.id;
  let client;
  try {
    if (await getManagingCompany(pool, userId)) {
      return res.status(403).json({ error: COMPANY_MANAGES_PLAN });
    }
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await applyAutoRenew(client, userId, auto_renew);
    if (!result) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "You do not have an active subscription." });
    }
    await client.query("COMMIT");
    return res.status(200).json({
      message: auto_renew ? "Auto-renew turned on." : "Auto-renew turned off.",
      autoRenew: auto_renew,
      renewalCreated: result.renewalCreated,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while changing auto-renew:", error);
    return res.status(500).json({ error: "An error occurred while changing auto-renew." });
  } finally {
    if (client) client.release();
  }
};
