import type { Pool, PoolClient } from "pg";
import { HttpError } from "../utils/httpError.js";
import { parseId } from "../utils/params.js";
import { cityExists } from "../utils/cities.js";
import {
  hashPassword,
  isUniqueViolation,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "../utils/accounts.js";
import { storeDescription, storeLogo } from "../utils/branding.js";
import { savedUnits } from "../controllers/dashboard.controller.js";
import { cancelPendingReservations } from "../controllers/admin.controller.js";

// Branches are STORE users with a company_id. Their headquarters (COMPANY) and admins create,
// name, view, deactivate and reactivate them; the branch itself works like any store. These
// functions run inside the caller's transaction and throw HttpError for the API answers.

// The status the headquarters sees. Deactivation comes first: a deactivated branch is closed
// whatever else holds; `blocked` is an admin's block of the branch itself.
export const BRANCH_STATUS = `CASE
  WHEN users.deactivated_at IS NOT NULL THEN 'deactivated'
  WHEN users.is_blocked THEN 'blocked'
  ELSE 'active' END`;
export const BRANCH_STATUSES = ["active", "deactivated", "blocked"];

// Counts shown on the branch list and the admin's company page.
export const ACTIVE_PRODUCTS = `(SELECT COUNT(*) FROM products
  WHERE products.store_id = users.id AND products.status = 'Available'
    AND products.expiry_date >= CURRENT_DATE) AS active_products`;
export const PENDING_RESERVATIONS = `(SELECT COUNT(*) FROM reservations
  JOIN products ON reservations.product_id = products.id
  WHERE products.store_id = users.id AND reservations.status = 'Pending') AS pending_reservations`;

export const BRANCH_NOT_FOUND = "Branch not found.";

export interface BranchRow {
  id: number;
  company_id: number | null;
  business_name: string | null;
  deactivated_at: string | null;
}

// The branch of `companyId`, or null for a missing user, a user of another company or a user
// that is not a store (the caller answers 404, so other companies' branches are not revealed).
export const findCompanyBranch = async (
  db: Pool | PoolClient,
  companyId: number,
  branchId: unknown,
  { lock = false }: { lock?: boolean } = {},
): Promise<BranchRow | null> => {
  const id = parseId(branchId);
  if (id === null) return null;
  const result = await db.query<BranchRow>(
    `SELECT users.id, users.company_id, users.business_name, users.deactivated_at
     FROM users
     WHERE users.id = $1 AND users.company_id = $2 AND users.role = 'STORE'
     ${lock ? "FOR UPDATE" : ""}`,
    [id, companyId],
  );
  return result.rows[0] ?? null;
};

interface BranchFields {
  business_name?: unknown;
  city_id?: unknown;
  address?: unknown;
  phone?: unknown;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// The business data the headquarters (or an admin) manages for a branch.
const parseBranchFields = async (db: Pool | PoolClient, body: BranchFields, requiredError: string) => {
  const businessName = text(body.business_name);
  const address = text(body.address);
  const phone = text(body.phone);
  if (!businessName || !address || !phone || body.city_id === undefined || body.city_id === "") {
    throw new HttpError(400, requiredError);
  }
  const cityId = parseId(body.city_id);
  if (cityId === null || !(await cityExists(db, cityId))) {
    throw new HttpError(400, "Invalid city.");
  }
  return { businessName, cityId, address, phone };
};

// A new branch: a STORE of the company with a temporary password. Its staff set their own
// password and fill in first and last name at the first login (the business data is already set).
// It starts without its own logo or description, so it shows the company's.
export const createBranch = async (
  client: PoolClient,
  companyId: number,
  body: BranchFields & { email?: unknown; password?: unknown },
) => {
  const company = await client.query("SELECT companies.is_blocked FROM companies WHERE companies.id = $1", [companyId]);
  if (company.rows[0]?.is_blocked) {
    throw new HttpError(403, "Your company is blocked.");
  }
  const fields = await parseBranchFields(
    client,
    body,
    "Business name, city, address, phone, email and password are required.",
  );
  if (!body.email || !body.password) {
    throw new HttpError(400, "Business name, city, address, phone, email and password are required.");
  }
  const credentialsError = validateEmail(body.email) ?? validatePassword(body.password);
  if (credentialsError) {
    throw new HttpError(400, credentialsError);
  }
  const passwordHash = await hashPassword(body.password as string);
  try {
    // A savepoint, so a duplicate email does not abort the caller's transaction.
    await client.query("SAVEPOINT create_branch");
    const result = await client.query<{ id: number }>(
      `INSERT INTO users
         (email, password_hash, role, company_id, business_name, city_id, address, phone, must_change_password)
       VALUES ($1, $2, 'STORE', $3, $4, $5, $6, $7, true)
       RETURNING users.id`,
      [
        normalizeEmail(body.email as string),
        passwordHash,
        companyId,
        fields.businessName,
        fields.cityId,
        fields.address,
        fields.phone,
      ],
    );
    await client.query("RELEASE SAVEPOINT create_branch");
    return result.rows[0]!.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      await client.query("ROLLBACK TO SAVEPOINT create_branch");
      throw new HttpError(400, "A user with this email already exists.");
    }
    throw error;
  }
};

export const updateBranch = async (db: Pool | PoolClient, branchId: number, body: BranchFields) => {
  const fields = await parseBranchFields(db, body, "Business name, city, address and phone are required.");
  await db.query(
    `UPDATE users SET business_name = $1, city_id = $2, address = $3, phone = $4 WHERE users.id = $5`,
    [fields.businessName, fields.cityId, fields.address, fields.phone, branchId],
  );
};

// Like an admin's password reset: the staff must replace it at the next login, and a running
// session is held back at once.
export const setBranchPassword = async (db: Pool | PoolClient, branchId: number, password: unknown) => {
  const passwordError = validatePassword(password);
  if (passwordError) {
    throw new HttpError(400, passwordError);
  }
  await db.query("UPDATE users SET password_hash = $1, must_change_password = true WHERE users.id = $2", [
    await hashPassword(password as string),
    branchId,
  ]);
};

// Deactivating closes a branch without losing its history: it is hidden from restaurants (its
// products through the visibility condition, unchanged) and cannot sign in. Refused while
// restaurants still wait to pick up accepted reservations; Pending ones are cancelled like a
// block does (refund, notification without a reason). The branch row must be locked.
export const deactivateBranch = async (
  client: PoolClient,
  branch: BranchRow,
  by: { actor: "ADMIN" | "USER"; userId: number },
) => {
  if (branch.deactivated_at) {
    throw new HttpError(400, "Branch is already deactivated.");
  }
  const confirmed = await client.query(
    `SELECT COUNT(*) AS count FROM reservations
     JOIN products ON reservations.product_id = products.id
     WHERE products.store_id = $1 AND reservations.status = 'Confirmed'`,
    [branch.id],
  );
  const count = Number(confirmed.rows[0].count);
  if (count > 0) {
    throw new HttpError(
      400,
      `The branch still has accepted pickups (${count}). Wait until they are picked up or cancelled.`,
    );
  }
  await client.query("UPDATE users SET deactivated_at = NOW(), deactivated_by = $1 WHERE users.id = $2", [
    by.userId,
    branch.id,
  ]);
  return cancelPendingReservations(
    client,
    "products.store_id = $1",
    [branch.id],
    (row) => row.restaurant_id,
    by.userId,
    { actor: by.actor, storeClosed: true },
  );
};

// Its products that have not expired show again through the visibility condition.
export const reactivateBranch = async (db: Pool | PoolClient, branch: BranchRow) => {
  if (!branch.deactivated_at) {
    throw new HttpError(400, "Branch is not deactivated.");
  }
  await db.query("UPDATE users SET deactivated_at = NULL, deactivated_by = NULL WHERE users.id = $1", [branch.id]);
};

// The branch page: the profile as restaurants see it (logo and description resolved), the login
// email, the status and who deactivated it.
export const getBranchProfile = async (db: Pool | PoolClient, branchId: number) => {
  const result = await db.query(
    `SELECT users.id, users.email, users.first_name, users.last_name, users.business_name, users.city_id,
       cities.name AS city, users.address, users.phone, users.opening_hours, users.pickup_hours,
       ${storeLogo("users")} AS logo_url, ${storeDescription("users")} AS description,
       users.logo_url IS NOT NULL AS has_own_logo,
       ${BRANCH_STATUS} AS status, users.is_blocked, users.deactivated_at,
       deactivators.email AS deactivated_by_email, users.must_change_password, users.created_at
     FROM users
     LEFT JOIN cities ON cities.id = users.city_id
     LEFT JOIN users AS deactivators ON deactivators.id = users.deactivated_by
     WHERE users.id = $1`,
    [branchId],
  );
  return result.rows[0];
};

// Numbers for the branch page; "this month" is the local calendar month (APP_TIMEZONE).
export const getBranchStats = async (db: Pool | PoolClient, branchId: number) => {
  const thisMonth = "reservations.status = 'Completed' AND reservations.picked_up_at >= date_trunc('month', CURRENT_DATE)";
  const result = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM products
        WHERE products.store_id = $1 AND products.status = 'Available'
          AND products.expiry_date >= CURRENT_DATE) AS active_products,
       COUNT(*) FILTER (WHERE reservations.status = 'Pending') AS pending_reservations,
       COUNT(*) FILTER (WHERE ${thisMonth}) AS completed_this_month,
       ${savedUnits(thisMonth)}
     FROM reservations
     JOIN products ON reservations.product_id = products.id
     WHERE products.store_id = $1`,
    [branchId],
  );
  const row = result.rows[0];
  return {
    active_products: Number(row.active_products),
    pending_reservations: Number(row.pending_reservations),
    completed_this_month: Number(row.completed_this_month),
    saved_this_month: { kg: Number(row.kg), l: Number(row.l), pieces: Number(row.pieces) },
  };
};
