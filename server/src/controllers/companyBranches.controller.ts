import pool from "../config/db.js";
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { CARD_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import { parseCityFilter } from "../utils/cities.js";
import { HttpError } from "../utils/httpError.js";
import {
  ACTIVE_PRODUCTS,
  BRANCH_NOT_FOUND,
  BRANCH_STATUS,
  BRANCH_STATUSES,
  PENDING_RESERVATIONS,
  createBranch,
  deactivateBranch,
  findCompanyBranch,
  type BranchRow,
  getBranchProfile,
  getBranchStats,
  reactivateBranch,
  setBranchPassword,
  updateBranch,
} from "../services/branches.js";
import { listStoreProducts } from "./products.controller.js";
import { listStoreReservations } from "./reservations.controller.js";

// The headquarters (COMPANY) manages its company's branches. Every branch route answers 404 for a
// branch of another company, so their existence is not revealed. The headquarters only reads a
// branch's products and reservations; the branch itself handles them.

// The caller's company (a COMPANY user always has one, see the users_company_matches_role CHECK).
export const callerCompanyId = async (req: Request): Promise<number> => {
  const result = await pool.query<{ company_id: number }>("SELECT users.company_id FROM users WHERE users.id = $1", [
    req.user!.id,
  ]);
  return result.rows[0]!.company_id;
};

// Answers the HttpError a branch function threw, otherwise logs and answers 500.
export const fail = (res: Response, error: unknown, message: string) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json(error.body());
  }
  console.error(message, error);
  return res.status(500).json({ error: message });
};

// Runs `work` in a transaction on the caller's branch (locked), or answers 404. The answer is sent
// after the commit, so a following request already sees the change.
export const withBranch = async (
  req: Request,
  res: Response,
  work: (client: PoolClient, branch: BranchRow) => Promise<Record<string, unknown>>,
  message: string,
  status = 200,
) => {
  let client;
  try {
    const companyId = await callerCompanyId(req);
    client = await pool.connect();
    await client.query("BEGIN");
    const branch = await findCompanyBranch(client, companyId, req.params.id, { lock: true });
    if (!branch) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: BRANCH_NOT_FOUND });
    }
    const body = await work(client, branch);
    await client.query("COMMIT");
    return res.status(status).json(body);
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    return fail(res, error, message);
  } finally {
    if (client) client.release();
  }
};

export const getBranches = async (req: Request, res: Response) => {
  const { q, status, city_id } = req.query;
  const page = parsePage(req.query, CARD_PAGE_SIZE);
  if (!page || (status && (typeof status !== "string" || !BRANCH_STATUSES.includes(status)))) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    const companyId = await callerCompanyId(req);
    let from = `FROM users LEFT JOIN cities ON cities.id = users.city_id
      WHERE users.company_id = $1 AND users.role = 'STORE'`;
    const values: (string | number)[] = [companyId];
    if (q) {
      values.push(`%${q}%`);
      from += ` AND users.business_name ILIKE $${values.length}`;
    }
    if (status) {
      values.push(status as string);
      from += ` AND ${BRANCH_STATUS} = $${values.length}`;
    }
    const cityFilter = await parseCityFilter(pool, city_id);
    if ("invalid" in cityFilter) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    if (cityFilter.cityId !== null) {
      values.push(cityFilter.cityId);
      from += ` AND users.city_id = $${values.length}`;
    }
    const { rows, total } = await listPage(
      `users.id, users.business_name, cities.name AS city, users.address, users.email,
       ${BRANCH_STATUS} AS status, ${ACTIVE_PRODUCTS}, ${PENDING_RESERVATIONS}, users.created_at`,
      from,
      "users.business_name ASC, users.id DESC",
      values,
      page,
    );
    const branches = rows.map((row) => ({
      ...row,
      active_products: Number(row.active_products),
      pending_reservations: Number(row.pending_reservations),
    }));
    return res.status(200).json({ message: "Branches fetched successfully.", branches, total });
  } catch (error) {
    return fail(res, error, "An error occurred while fetching branches.");
  }
};

export const createCompanyBranch = async (req: Request, res: Response) => {
  let client;
  try {
    const companyId = await callerCompanyId(req);
    client = await pool.connect();
    await client.query("BEGIN");
    const id = await createBranch(client, companyId, req.body);
    const branch = await getBranchProfile(client, id);
    await client.query("COMMIT");
    return res.status(201).json({ message: "Branch created successfully.", branch });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    return fail(res, error, "An error occurred while creating the branch.");
  } finally {
    if (client) client.release();
  }
};

export const getBranchDetails = async (req: Request, res: Response) => {
  try {
    const branch = await findCompanyBranch(pool, await callerCompanyId(req), req.params.id);
    if (!branch) {
      return res.status(404).json({ error: BRANCH_NOT_FOUND });
    }
    return res.status(200).json({
      message: "Branch fetched successfully.",
      branch: await getBranchProfile(pool, branch.id),
      stats: await getBranchStats(pool, branch.id),
    });
  } catch (error) {
    return fail(res, error, "An error occurred while fetching the branch.");
  }
};

export const getBranchProducts = async (req: Request, res: Response) => {
  try {
    const branch = await findCompanyBranch(pool, await callerCompanyId(req), req.params.id);
    if (!branch) {
      return res.status(404).json({ error: BRANCH_NOT_FOUND });
    }
    const result = await listStoreProducts(branch.id, req.query);
    if (!result) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    return res.status(200).json(result);
  } catch (error) {
    return fail(res, error, "An error occurred while fetching products.");
  }
};

export const getBranchReservations = async (req: Request, res: Response) => {
  try {
    const branch = await findCompanyBranch(pool, await callerCompanyId(req), req.params.id);
    if (!branch) {
      return res.status(404).json({ error: BRANCH_NOT_FOUND });
    }
    const result = await listStoreReservations(branch.id, req.query);
    if (!result) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    return res.status(200).json({ message: "Reservations fetched successfully.", ...result });
  } catch (error) {
    return fail(res, error, "An error occurred while fetching reservations.");
  }
};

export const updateCompanyBranch = (req: Request, res: Response) =>
  withBranch(
    req,
    res,
    async (client, branch) => {
      await updateBranch(client, branch.id, req.body);
      return { message: "Branch updated.", branch: await getBranchProfile(client, branch.id) };
    },
    "An error occurred while updating the branch.",
  );

export const setCompanyBranchPassword = (req: Request, res: Response) =>
  withBranch(
    req,
    res,
    async (client, branch) => {
      await setBranchPassword(client, branch.id, req.body.password);
      return { message: "Password changed successfully." };
    },
    "An error occurred while changing the password.",
  );

export const deactivateCompanyBranch = (req: Request, res: Response) =>
  withBranch(
    req,
    res,
    async (client, branch) => {
      const closed = await deactivateBranch(client, branch, { actor: "USER", userId: req.user!.id });
      return { message: "Branch deactivated.", ...closed };
    },
    "An error occurred while deactivating the branch.",
  );

export const reactivateCompanyBranch = (req: Request, res: Response) =>
  withBranch(
    req,
    res,
    async (client, branch) => {
      await reactivateBranch(client, branch);
      return { message: "Branch reactivated." };
    },
    "An error occurred while reactivating the branch.",
  );
