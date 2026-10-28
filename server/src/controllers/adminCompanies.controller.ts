import pool from "../config/db.js";
import type { Request, Response } from "express";
import { parseId } from "../utils/params.js";
import { ADMIN_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import {
  hashPassword,
  isUniqueViolation,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "../utils/accounts.js";
import {
  REASON_ERROR,
  RECENT_ACTIONS_LIMIT,
  cancelPendingReservations,
  logAdminAction,
  parseReason,
} from "./admin.controller.js";
import { HttpError } from "../utils/httpError.js";
import { notifyCompanyHq } from "../utils/notifications.js";
import {
  ACTIVE_PRODUCTS,
  BRANCH_NOT_FOUND,
  BRANCH_STATUS,
  deactivateBranch,
  findCompanyBranch,
  reactivateBranch,
} from "../services/branches.js";

// Companies are store chains. An admin creates a company together with its headquarters login
// (a COMPANY user); branches are STORE users with the company's company_id (step 2.2).

export const MAX_COMPANY_NAME_LENGTH = 120;
export const MAX_COMPANY_DESCRIPTION_LENGTH = 1000;
const COMPANY_NAME_INDEX = "companies_name_lower_unique";
const DUPLICATE_NAME_ERROR = "A company with this name already exists.";

export const COMPANY_COLUMNS = `companies.id, companies.name, companies.description, companies.logo_url,
  companies.is_blocked, companies.blocked_at, companies.blocked_reason, companies.created_at,
  companies.updated_at`;

// The company's stores (its branches), counted for the lists.
export const BRANCH_COUNT = `(SELECT COUNT(*) FROM users AS branches
  WHERE branches.company_id = companies.id AND branches.role = 'STORE') AS branch_count`;

// The first headquarters login of the company (one per company for now).
const HQ_EMAIL = `(SELECT hq.email FROM users AS hq
  WHERE hq.company_id = companies.id AND hq.role = 'COMPANY'
  ORDER BY hq.id LIMIT 1) AS hq_email`;

// A trimmed company name, or the error for a missing or too long one.
const parseCompanyName = (value: unknown): { name: string } | { error: string } => {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return { error: "Company name is required." };
  if (name.length > MAX_COMPANY_NAME_LENGTH) {
    return { error: `Company name can be at most ${MAX_COMPANY_NAME_LENGTH} characters long.` };
  }
  return { name };
};

export const parseCompanyDescription = (value: unknown): { description: string | null } | { error: string } => {
  if (value === undefined || value === null) return { description: null };
  if (typeof value !== "string") return { error: "Description is not valid." };
  const description = value.trim();
  if (description.length > MAX_COMPANY_DESCRIPTION_LENGTH) {
    return { error: `Description can be at most ${MAX_COMPANY_DESCRIPTION_LENGTH} characters long.` };
  }
  return { description: description || null };
};

const isDuplicateName = (error: unknown) =>
  isUniqueViolation(error) &&
  error instanceof Error &&
  "constraint" in error &&
  error.constraint === COMPANY_NAME_INDEX;

export const getCompanies = async (req: Request, res: Response) => {
  const { q, blocked } = req.query;
  const page = parsePage(req.query, ADMIN_PAGE_SIZE);
  if (!page) {
    return res.status(400).json({ error: "Invalid filter." });
  }

  let from = "FROM companies WHERE true";
  const values: (string | number | boolean)[] = [];
  if (blocked) {
    if (blocked !== "true" && blocked !== "false") {
      return res.status(400).json({ error: "Invalid filter." });
    }
    values.push(blocked === "true");
    from += ` AND companies.is_blocked = $${values.length}`;
  }
  if (q) {
    values.push(`%${q}%`);
    from += ` AND (companies.name ILIKE $${values.length} OR EXISTS (
      SELECT 1 FROM users WHERE users.company_id = companies.id AND users.role = 'COMPANY'
        AND users.email ILIKE $${values.length}))`;
  }

  try {
    const { rows, total } = await listPage(
      `companies.id, companies.name, companies.is_blocked, companies.created_at, ${HQ_EMAIL}, ${BRANCH_COUNT}`,
      from,
      "companies.created_at DESC, companies.id DESC",
      values,
      page,
    );
    const companies = rows.map((row) => ({ ...row, branch_count: Number(row.branch_count) }));
    return res.status(200).json({ companies, total });
  } catch (error) {
    console.error("Error while fetching companies:", error);
    return res.status(500).json({ error: "An error occurred while fetching companies." });
  }
};

export const getCompanyDetails = async (req: Request, res: Response) => {
  const companyId = parseId(req.params.id);
  if (companyId === null) {
    return res.status(404).json({ error: "Company not found." });
  }
  try {
    const company = await pool.query(
      `SELECT ${COMPANY_COLUMNS}, ${BRANCH_COUNT} FROM companies WHERE companies.id = $1`,
      [companyId],
    );
    if (company.rows.length === 0) {
      return res.status(404).json({ error: "Company not found." });
    }
    const hqUsers = await pool.query(
      `SELECT users.id, users.email, users.first_name, users.last_name, users.phone, users.is_blocked,
         users.must_change_password, users.created_at
       FROM users WHERE users.company_id = $1 AND users.role = 'COMPANY'
       ORDER BY users.id`,
      [companyId],
    );
    const branches = await pool.query(
      `SELECT users.id, users.email, users.business_name, cities.name AS city, users.is_blocked,
         users.deactivated_at, ${BRANCH_STATUS} AS status, ${ACTIVE_PRODUCTS}, users.created_at
       FROM users LEFT JOIN cities ON cities.id = users.city_id
       WHERE users.company_id = $1 AND users.role = 'STORE'
       ORDER BY users.business_name, users.id`,
      [companyId],
    );
    const actions = await pool.query(
      `SELECT admin_actions.id, admin_actions.action, admin_actions.reason, admin_actions.created_at,
         admins.email AS admin_email, admin_actions.target_user_id, targets.business_name AS target_business_name
       FROM admin_actions
       JOIN users AS admins ON admin_actions.admin_id = admins.id
       LEFT JOIN users AS targets ON admin_actions.target_user_id = targets.id
       WHERE admin_actions.target_company_id = $1
       ORDER BY admin_actions.created_at DESC, admin_actions.id DESC
       LIMIT $2`,
      [companyId, RECENT_ACTIONS_LIMIT],
    );
    const row = company.rows[0];
    return res.status(200).json({
      company: { ...row, branch_count: Number(row.branch_count) },
      hqUsers: hqUsers.rows,
      branches: branches.rows.map((branch) => ({ ...branch, active_products: Number(branch.active_products) })),
      actions: actions.rows,
    });
  } catch (error) {
    console.error("Error while fetching company:", error);
    return res.status(500).json({ error: "An error occurred while fetching the company." });
  }
};

// The company and its headquarters login are created together, so a company never exists
// without a login. The admin chose the password, so it must be replaced at the first login.
export const createCompany = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Company name, email and password are required." });
  }
  const parsedName = parseCompanyName(name);
  if ("error" in parsedName) {
    return res.status(400).json({ error: parsedName.error });
  }
  const credentialsError = validateEmail(email) ?? validatePassword(password);
  if (credentialsError) {
    return res.status(400).json({ error: credentialsError });
  }

  let client;
  try {
    const passwordHash = await hashPassword(password);
    client = await pool.connect();
    await client.query("BEGIN");
    const companyResult = await client.query(
      `INSERT INTO companies (name) VALUES ($1) RETURNING ${COMPANY_COLUMNS}`,
      [parsedName.name],
    );
    const company = companyResult.rows[0];
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role, company_id, must_change_password)
       VALUES ($1, $2, 'COMPANY', $3, true)
       RETURNING users.id, users.email, users.role, users.company_id, users.must_change_password, users.created_at`,
      [normalizeEmail(email), passwordHash, company.id],
    );
    await logAdminAction(client, { adminId: req.user!.id, action: "CREATE_COMPANY", targetCompanyId: company.id });
    await client.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Company created successfully.", company: { ...company, branch_count: 0 }, user: userResult.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (isDuplicateName(error)) {
      return res.status(400).json({ error: DUPLICATE_NAME_ERROR });
    }
    if (isUniqueViolation(error)) {
      return res.status(400).json({ error: "A user with this email already exists." });
    }
    console.error("Error while creating company:", error);
    return res.status(500).json({ error: "An error occurred while creating the company." });
  } finally {
    if (client) client.release();
  }
};

// Only an admin changes a company's name; the headquarters edits the description and logo.
export const updateCompany = async (req: Request, res: Response) => {
  const companyId = parseId(req.params.id);
  if (companyId === null) {
    return res.status(404).json({ error: "Company not found." });
  }
  const parsedName = parseCompanyName(req.body.name);
  if ("error" in parsedName) {
    return res.status(400).json({ error: parsedName.error });
  }
  const parsedDescription = parseCompanyDescription(req.body.description);
  if ("error" in parsedDescription) {
    return res.status(400).json({ error: parsedDescription.error });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE companies SET name = $1, description = $2 WHERE companies.id = $3
       RETURNING ${COMPANY_COLUMNS}, ${BRANCH_COUNT}`,
      [parsedName.name, parsedDescription.description, companyId],
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Company not found." });
    }
    await logAdminAction(client, { adminId: req.user!.id, action: "UPDATE_COMPANY", targetCompanyId: companyId });
    await client.query("COMMIT");
    const row = result.rows[0];
    return res
      .status(200)
      .json({ message: "Company updated.", company: { ...row, branch_count: Number(row.branch_count) } });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (isDuplicateName(error)) {
      return res.status(400).json({ error: DUPLICATE_NAME_ERROR });
    }
    console.error("Error while updating company:", error);
    return res.status(500).json({ error: "An error occurred while updating the company." });
  } finally {
    if (client) client.release();
  }
};

// Blocking a company blocks every user of it at once (login, authenticate and the store
// visibility read the company's flag) and cancels the Pending reservations of its stores on
// both sides, like blocking each store would. users.is_blocked is not touched, so unblocking
// the company leaves a store an admin blocked on its own still blocked.
export const blockCompany = async (req: Request, res: Response) => {
  const companyId = parseId(req.params.id);
  if (companyId === null) {
    return res.status(404).json({ error: "Company not found." });
  }
  const reason = parseReason(req.body.reason);
  if (!reason) {
    return res.status(400).json({ error: REASON_ERROR });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT companies.is_blocked FROM companies WHERE companies.id = $1 FOR UPDATE",
      [companyId],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Company not found." });
    }
    if (existing.rows[0].is_blocked) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Company is already blocked." });
    }
    const result = await client.query(
      `UPDATE companies SET is_blocked = true, blocked_at = NOW(), blocked_reason = $1
       WHERE companies.id = $2 RETURNING ${COMPANY_COLUMNS}, ${BRANCH_COUNT}`,
      [reason, companyId],
    );
    const companyStores = "SELECT users.id FROM users WHERE users.company_id = $1 AND users.role = 'STORE'";
    const storeIds = new Set(
      (await client.query<{ id: number }>(companyStores, [companyId])).rows.map((store) => store.id),
    );
    // The other party of each reservation is told; the company's users cannot sign in anyway.
    const cancelledReservations = await cancelPendingReservations(
      client,
      `products.store_id IN (${companyStores}) OR reservations.restaurant_id IN (${companyStores})`,
      [companyId],
      (row) => (storeIds.has(row.restaurant_id) ? row.store_id : row.restaurant_id),
      req.user!.id,
    );
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "BLOCK_COMPANY",
      targetCompanyId: companyId,
      reason,
    });
    await client.query("COMMIT");
    const row = result.rows[0];
    return res.status(200).json({
      message: "Company blocked.",
      company: { ...row, branch_count: Number(row.branch_count) },
      cancelledReservations,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while blocking company:", error);
    return res.status(500).json({ error: "An error occurred while blocking the company." });
  } finally {
    if (client) client.release();
  }
};

export const unblockCompany = async (req: Request, res: Response) => {
  const companyId = parseId(req.params.id);
  if (companyId === null) {
    return res.status(404).json({ error: "Company not found." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT companies.is_blocked FROM companies WHERE companies.id = $1 FOR UPDATE",
      [companyId],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Company not found." });
    }
    if (!existing.rows[0].is_blocked) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Company is not blocked." });
    }
    const result = await client.query(
      `UPDATE companies SET is_blocked = false, blocked_at = NULL, blocked_reason = NULL
       WHERE companies.id = $1 RETURNING ${COMPANY_COLUMNS}, ${BRANCH_COUNT}`,
      [companyId],
    );
    await logAdminAction(client, { adminId: req.user!.id, action: "UNBLOCK_COMPANY", targetCompanyId: companyId });
    await client.query("COMMIT");
    const row = result.rows[0];
    return res
      .status(200)
      .json({ message: "Company unblocked.", company: { ...row, branch_count: Number(row.branch_count) } });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while unblocking company:", error);
    return res.status(500).json({ error: "An error occurred while unblocking the company." });
  } finally {
    if (client) client.release();
  }
};

// A chain whose stores are already on the platform: an admin attaches an existing store without a
// company. There is no detach; a branch cannot leave its company.
export const attachBranch = async (req: Request, res: Response) => {
  const companyId = parseId(req.params.id);
  if (companyId === null) {
    return res.status(404).json({ error: "Company not found." });
  }
  const userId = parseId(req.body.user_id);
  if (userId === null) {
    return res.status(404).json({ error: "User not found." });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const company = await client.query("SELECT companies.id FROM companies WHERE companies.id = $1", [companyId]);
    if (company.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Company not found." });
    }
    const user = await client.query(
      "SELECT users.role, users.company_id FROM users WHERE users.id = $1 FOR UPDATE",
      [userId],
    );
    if (user.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    if (user.rows[0].role !== "STORE" || user.rows[0].company_id !== null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Only a store without a company can be attached." });
    }
    await client.query("UPDATE users SET company_id = $1 WHERE users.id = $2", [companyId, userId]);
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "ATTACH_BRANCH",
      targetUserId: userId,
      targetCompanyId: companyId,
    });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Store attached to the company." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while attaching store:", error);
    return res.status(500).json({ error: "An error occurred while attaching the store." });
  } finally {
    if (client) client.release();
  }
};

// The admin deactivates or reactivates a branch with the headquarters' rules; the headquarters is
// notified and the action is logged.
const changeBranchActivation = async (req: Request, res: Response, deactivate: boolean) => {
  const companyId = parseId(req.params.id);
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const branch = companyId === null ? null : await findCompanyBranch(client, companyId, req.params.branchId, { lock: true });
    if (!branch) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: BRANCH_NOT_FOUND });
    }
    let cancelledReservations = 0;
    if (deactivate) {
      cancelledReservations = await deactivateBranch(client, branch, { actor: "ADMIN", userId: req.user!.id });
    } else {
      await reactivateBranch(client, branch);
    }
    await notifyCompanyHq(client, branch, deactivate ? "BRANCH_DEACTIVATED" : "BRANCH_REACTIVATED");
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: deactivate ? "DEACTIVATE_BRANCH" : "REACTIVATE_BRANCH",
      targetUserId: branch.id,
      targetCompanyId: companyId,
    });
    await client.query("COMMIT");
    return res
      .status(200)
      .json(deactivate ? { message: "Branch deactivated.", cancelledReservations } : { message: "Branch reactivated." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error instanceof HttpError) {
      return res.status(error.status).json(error.body());
    }
    console.error("Error while changing branch:", error);
    return res.status(500).json({ error: "An error occurred while changing the branch." });
  } finally {
    if (client) client.release();
  }
};

export const deactivateBranchByAdmin = (req: Request, res: Response) => changeBranchActivation(req, res, true);
export const reactivateBranchByAdmin = (req: Request, res: Response) => changeBranchActivation(req, res, false);
