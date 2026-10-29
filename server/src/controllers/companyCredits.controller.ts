import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId, parseNonNegativeInt } from "../utils/params.js";
import { TABLE_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import { HttpError } from "../utils/httpError.js";
import { creditMonth } from "../utils/creditTime.js";
import { createNotification, notifyAdminsOfCreditRequest } from "../utils/notifications.js";
import { getUsageHistory } from "../services/creditService.js";
import {
  BRANCH_REQUESTS_FROM,
  listBranchTopupRequests,
  listCompanyBranchCredits,
} from "../services/companyCredits.js";
import {
  CREDIT_REQUEST_COLUMNS,
  CREDIT_REQUEST_JOINS,
  CREDIT_REQUEST_STATUSES,
  CREDIT_REQUEST_TYPES,
  applyAutoRenew,
  createCreditRequest,
  creditSummary,
  findRequest,
} from "../services/creditRequests.js";
import { BRANCH_NOT_FOUND, findCompanyBranch } from "../services/branches.js";
import { MAX_NOTE_LENGTH, parseNote } from "./adminCredits.controller.js";
import { callerCompanyId, fail, withBranch } from "./companyBranches.controller.js";

// The headquarters (COMPANY) asks and pays for its branches' credits. Credits stay per branch
// (balance, charges and refunds work as for any store); only who asks changes: the headquarters
// sends the plans and top-ups to the admin, and decides on the top-ups its branches ask it for
// (COMPANY_REVIEW) before they reach the admin. Every branch route answers 404 for a branch of
// another company. admin_note is never returned (CREDIT_REQUEST_COLUMNS leaves it out).

const parseYear = (value: unknown) =>
  value === undefined ? Number(creditMonth(new Date()).slice(0, 4)) : parseNonNegativeInt(value);

// This month's credits of every branch with the company's totals (see listCompanyBranchCredits).
export const getCompanyCredits = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(await listCompanyBranchCredits(pool, await callerCompanyId(req)));
  } catch (error) {
    return fail(res, error, "An error occurred while fetching credits.");
  }
};

// One branch as it sees its own credits: the balance, the usage history of a year and its
// requests (paged, newest first).
export const getBranchCredits = async (req: Request, res: Response) => {
  const page = parsePage(req.query, TABLE_PAGE_SIZE);
  const year = parseYear(req.query.year);
  if (!page || year === null || year < 2000 || year > 2100) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    const branch = await findCompanyBranch(pool, await callerCompanyId(req), req.params.id);
    if (!branch) {
      return res.status(404).json({ error: BRANCH_NOT_FOUND });
    }
    const { rows, total } = await listPage(
      CREDIT_REQUEST_COLUMNS,
      `FROM credit_requests ${CREDIT_REQUEST_JOINS} WHERE credit_requests.user_id = $1`,
      "credit_requests.created_at DESC, credit_requests.id DESC",
      [branch.id],
      page,
    );
    return res.status(200).json({
      credits: await creditSummary(pool, branch.id),
      history: await getUsageHistory(pool, branch.id, year),
      requests: rows,
      total,
    });
  } catch (error) {
    return fail(res, error, "An error occurred while fetching credits.");
  }
};

// A plan (this or next month, with or without auto-renew) or a top-up for a branch: the rules and
// messages of the user's own request, sent by the headquarters straight to the admins.
export const createBranchRequest = (req: Request, res: Response) =>
  withBranch(
    req,
    res,
    async (client, branch) => {
      if (branch.deactivated_at) {
        throw new HttpError(400, "The branch is deactivated.");
      }
      const requestId = await createCreditRequest(client, req.body, {
        userId: branch.id,
        requestedBy: req.user!.id,
        source: "COMPANY",
      });
      await notifyAdminsOfCreditRequest(
        client,
        requestId,
        `New ${req.body.request_type === "SUBSCRIPTION" ? "subscription" : "top-up"} request waiting for approval.`,
      );
      return { message: "Request sent.", request: await findRequest(client, requestId) };
    },
    "An error occurred while sending the request.",
    201,
  );

// Withdraws a branch's request the admin has not decided yet.
export const withdrawBranchRequest = (req: Request, res: Response) =>
  withBranch(
    req,
    res,
    async (client, branch) => {
      const requestId = parseId(req.params.requestId);
      const existing = requestId === null
        ? undefined
        : (await client.query(
            "SELECT credit_requests.status FROM credit_requests WHERE credit_requests.id = $1 AND credit_requests.user_id = $2 FOR UPDATE",
            [requestId, branch.id],
          )).rows[0];
      if (!existing) {
        throw new HttpError(404, "Request not found.");
      }
      if (existing.status !== "PENDING") {
        throw new HttpError(400, "Only pending requests can be withdrawn.");
      }
      await client.query("UPDATE credit_requests SET status = 'CANCELLED' WHERE credit_requests.id = $1", [requestId]);
      return { message: "Request withdrawn.", request: await findRequest(client, requestId!) };
    },
    "An error occurred while withdrawing the request.",
  );

// The branch's auto-renew, with the rules of the user's own switch (applyAutoRenew).
export const setBranchAutoRenew = (req: Request, res: Response) => {
  const { auto_renew } = req.body;
  if (typeof auto_renew !== "boolean") {
    return res.status(400).json({ error: "Auto-renew must be true or false." });
  }
  return withBranch(
    req,
    res,
    async (client, branch) => {
      const result = await applyAutoRenew(client, branch.id, auto_renew);
      if (!result) {
        throw new HttpError(404, "The branch does not have an active subscription.");
      }
      return {
        message: auto_renew ? "Auto-renew turned on." : "Auto-renew turned off.",
        autoRenew: auto_renew,
        renewalCreated: result.renewalCreated,
      };
    },
    "An error occurred while changing auto-renew.",
  );
};

// The top-ups the branches asked for that wait for the headquarters (see listBranchTopupRequests).
export const getBranchTopupRequests = async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ requests: await listBranchTopupRequests(pool, await callerCompanyId(req)) });
  } catch (error) {
    return fail(res, error, "An error occurred while fetching credit requests.");
  }
};

// For the sidebar badge.
export const getBranchTopupRequestCount = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count ${BRANCH_REQUESTS_FROM} AND credit_requests.status = 'COMPANY_REVIEW'`,
      [await callerCompanyId(req)],
    );
    return res.status(200).json({ count: result.rows[0].count });
  } catch (error) {
    return fail(res, error, "An error occurred while counting credit requests.");
  }
};

// The headquarters decides on a branch's top-up. Approving makes it a normal pending top-up for
// the admin, sent by the headquarters (requested_by), and tells the admins; rejecting closes it
// with an optional note the branch sees. The branch is told either way.
const decideBranchRequest = (decision: "APPROVED" | "REJECTED") => async (req: Request, res: Response) => {
  const requestId = parseId(req.params.id);
  if (requestId === null) {
    return res.status(404).json({ error: "Request not found." });
  }
  const note = decision === "REJECTED" ? parseNote(req.body?.note) : null;
  if (note === undefined) {
    return res.status(400).json({ error: `The note can be at most ${MAX_NOTE_LENGTH} characters long.` });
  }
  let client;
  try {
    const companyId = await callerCompanyId(req);
    client = await pool.connect();
    await client.query("BEGIN");
    // Locked so the branch's withdrawal or the expiry job cannot change it at the same time.
    const locked = await client.query(
      `SELECT credit_requests.id, credit_requests.user_id, credit_requests.status, credit_requests.period_month
       ${BRANCH_REQUESTS_FROM} AND credit_requests.id = $2 AND credit_requests.request_type = 'TOPUP'
       FOR UPDATE OF credit_requests`,
      [companyId, requestId],
    );
    const request = locked.rows[0];
    if (!request) {
      throw new HttpError(404, "Request not found.");
    }
    if (request.status !== "COMPANY_REVIEW") {
      throw new HttpError(400, "Only requests waiting for your company can be approved or rejected.");
    }

    if (decision === "APPROVED") {
      // A top-up belongs to the month it was asked for.
      if (request.period_month !== creditMonth(new Date())) {
        throw new HttpError(400, "This month has already ended.");
      }
      await client.query(
        `UPDATE credit_requests
         SET status = 'PENDING', requested_by = $1, company_reviewed_by = $1, company_reviewed_at = NOW()
         WHERE credit_requests.id = $2`,
        [req.user!.id, requestId],
      );
      await notifyAdminsOfCreditRequest(client, requestId, "New top-up request waiting for approval.");
    } else {
      await client.query(
        `UPDATE credit_requests
         SET status = 'COMPANY_REJECTED', company_note = $1, company_reviewed_by = $2, company_reviewed_at = NOW()
         WHERE credit_requests.id = $3`,
        [note, req.user!.id, requestId],
      );
    }
    await createNotification(client, {
      userId: request.user_id,
      type: decision === "APPROVED" ? "CREDIT_TOPUP_COMPANY_APPROVED" : "CREDIT_TOPUP_COMPANY_REJECTED",
      message: decision === "APPROVED"
        ? "Your company sent your top-up request for approval."
        : "Your company rejected your top-up request.",
      creditRequestId: requestId,
      details: note,
    });
    await client.query("COMMIT");
    return res.status(200).json({
      message: decision === "APPROVED" ? "Request approved." : "Request rejected.",
      request: await findRequest(pool, requestId),
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    return fail(res, error, "An error occurred while processing the request.");
  } finally {
    if (client) client.release();
  }
};

export const approveBranchTopupRequest = decideBranchRequest("APPROVED");
export const rejectBranchTopupRequest = decideBranchRequest("REJECTED");

// Every branch's requests, newest first and in pages. Filters: branch_id, status, type.
export const getCompanyCreditRequests = async (req: Request, res: Response) => {
  const { branch_id, status, type } = req.query;
  const page = parsePage(req.query, TABLE_PAGE_SIZE);
  const branchId = branch_id ? parseId(branch_id) : null;
  if (
    !page ||
    (branch_id && branchId === null) ||
    (status && !CREDIT_REQUEST_STATUSES.includes(status as string)) ||
    (type && !CREDIT_REQUEST_TYPES.includes(type as string))
  ) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    let from = BRANCH_REQUESTS_FROM;
    const values: (string | number)[] = [await callerCompanyId(req)];
    if (branchId !== null) {
      values.push(branchId);
      from += ` AND credit_requests.user_id = $${values.length}`;
    }
    if (status) {
      values.push(status as string);
      from += ` AND credit_requests.status = $${values.length}`;
    }
    if (type) {
      values.push(type as string);
      from += ` AND credit_requests.request_type = $${values.length}`;
    }
    const { rows, total } = await listPage(
      `${CREDIT_REQUEST_COLUMNS}, branches.business_name AS branch_name`,
      from,
      "credit_requests.created_at DESC, credit_requests.id DESC",
      values,
      page,
    );
    return res.status(200).json({ requests: rows, total });
  } catch (error) {
    return fail(res, error, "An error occurred while fetching credit requests.");
  }
};
