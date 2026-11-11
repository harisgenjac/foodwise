import pool from "../config/db.js";
import type { Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { createNotification, notifyAnnouncement, notifyCompanyHq } from "../utils/notifications.js";
import { parseId } from "../utils/params.js";
import { ADMIN_PAGE_SIZE, listPage, parsePage, parseSort } from "../utils/pagination.js";
import {
  INVALID_CREATE_METHOD,
  hashPassword,
  initialPasswordHash,
  isUniqueViolation,
  normalizeEmail,
  parseCreateMethod,
  validateEmail,
  validatePassword,
} from "../utils/accounts.js";
import { PRODUCT_STATUSES } from "./products.controller.js";
import { DONATION_STATUSES, DONATION_TYPES } from "../utils/validateDonation.js";
import { ORDER_STATUSES } from "../services/orders/status.js";
import { cancelPendingItemsOfProducts, cancelPendingOrders, lockOrdersHoldingProducts } from "../services/orders/cascades.js";
import { updateProfile } from "./users.controller.js";
import { isValidDateTime } from "../utils/dates.js";
import { CITY_NAME, parseCityFilter } from "../utils/cities.js";
import { getPlatformUsage } from "../services/creditService.js";
import { getSavedTotals } from "../services/impactStats.js";
import { creditMonth, nextMonth } from "../utils/creditTime.js";
import type { Role } from "../types/auth.js";
import { notBlocked } from "../utils/visibility.js";
import { sendInvitation, sendPasswordResetLink } from "../services/accountEmails.js";

// Every role an admin can filter by. COMPANY accounts are created with their company
// (POST /companies), never through POST /users.
export const ROLES = ["STORE", "RESTAURANT", "ADMIN", "COMPANY"];
const USER_CREATED_ROLES = ["STORE", "RESTAURANT", "ADMIN"];
export const ADMIN_ACTIONS = [
  "CREATE_USER",
  "SEND_INVITATION",
  "RESEND_INVITATION",
  "SEND_PASSWORD_RESET_LINK",
  "RESET_PASSWORD",
  "BLOCK_USER",
  "UNBLOCK_USER",
  "REMOVE_PRODUCT",
  "REMOVE_DONATION",
  "CANCEL_RESERVATION",
  "CANCEL_ORDER",
  "UPDATE_PROFILE",
  "CREATE_ANNOUNCEMENT",
  "END_ANNOUNCEMENT",
  "APPROVE_CREDIT_REQUEST",
  "REJECT_CREDIT_REQUEST",
  "ADJUST_CREDITS",
  "CREATE_COMPANY",
  "UPDATE_COMPANY",
  "BLOCK_COMPANY",
  "UNBLOCK_COMPANY",
  "DEACTIVATE_BRANCH",
  "REACTIVATE_BRANCH",
  "ATTACH_BRANCH",
];
export const ANNOUNCEMENT_AUDIENCES = ["ALL", "STORE", "RESTAURANT"];

const MAX_REASON_LENGTH = 500;
export const RECENT_ACTIONS_LIMIT = 20;

// The sortable columns of each admin table (`?sort=<key>&dir=asc|desc`, see parseSort).
const USER_SORTS = { created_at: "users.created_at" };
const PRODUCT_SORTS = { discounted_price: "products.discounted_price", expiry_date: "products.expiry_date" };
const DONATION_SORTS = { expiry_date: "donation_offers.expiry_date" };

const USER_COLUMNS = `users.id, users.email, users.role, users.first_name, users.last_name,
  users.business_name, users.city_id, ${CITY_NAME}, users.address, users.phone, users.logo_url,
  users.opening_hours, users.pickup_hours, users.description,
  users.is_blocked, users.blocked_at, users.blocked_reason, users.must_change_password, users.created_at,
  users.last_login_at,
  users.company_id, users.deactivated_at,
  (SELECT companies.name FROM companies WHERE companies.id = users.company_id) AS company_name,
  COALESCE((SELECT companies.is_blocked FROM companies WHERE companies.id = users.company_id), false)
    AS company_is_blocked`;

interface AdminAction {
  adminId: number;
  action: string;
  targetUserId?: number | null;
  targetProductId?: number | null;
  targetDonationId?: number | null;
  targetReservationId?: number | null;
  targetOrderId?: number | null;
  targetAnnouncementId?: number | null;
  targetCreditRequestId?: number | null;
  targetCompanyId?: number | null;
  reason?: string | null;
}

// Every admin action is written to the audit log, inside the action's transaction when it has one.
export const logAdminAction = async (
  db: Pool | PoolClient,
  {
    adminId,
    action,
    targetUserId = null,
    targetProductId = null,
    targetDonationId = null,
    targetReservationId = null,
    targetOrderId = null,
    targetAnnouncementId = null,
    targetCreditRequestId = null,
    targetCompanyId = null,
    reason = null,
  }: AdminAction,
) => {
  await db.query(
    `INSERT INTO admin_actions
       (admin_id, action, target_user_id, target_product_id, target_donation_id, target_reservation_id,
        target_order_id, target_announcement_id, target_credit_request_id, target_company_id, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      adminId,
      action,
      targetUserId,
      targetProductId,
      targetDonationId,
      targetReservationId,
      targetOrderId,
      targetAnnouncementId,
      targetCreditRequestId,
      targetCompanyId,
      reason,
    ],
  );
};

// A trimmed reason, or null when it is missing or too long.
export const parseReason = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason && reason.length <= MAX_REASON_LENGTH ? reason : null;
};
export const REASON_ERROR = `A reason is required (at most ${MAX_REASON_LENGTH} characters).`;

export const getStats = async (req: Request, res: Response) => {
  try {
    const users = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE users.role = 'STORE') AS stores,
         COUNT(*) FILTER (WHERE users.role = 'RESTAURANT') AS restaurants,
         COUNT(*) FILTER (WHERE users.role = 'ADMIN') AS admins,
         COUNT(*) FILTER (WHERE NOT ${notBlocked("users")}) AS blocked,
         COUNT(*) FILTER (WHERE users.role IN ('STORE', 'RESTAURANT') AND users.business_name IS NULL) AS incomplete_profiles
       FROM users`,
    );
    const products = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE products.status = 'Available' AND products.expiry_date >= CURRENT_DATE) AS active,
         COUNT(*) FILTER (WHERE products.status = 'Sold') AS sold,
         COUNT(*) FILTER (WHERE products.status = 'Expired') AS expired,
         COUNT(*) FILTER (WHERE products.status = 'Removed') AS removed
       FROM products`,
    );
    const orders = await pool.query(`SELECT orders.status, COUNT(*) AS count FROM orders GROUP BY orders.status`);
    const saved = await getSavedTotals();
    const donations = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE donation_offers.status = 'Available') AS available,
         COUNT(*) FILTER (WHERE donation_offers.status = 'Expired') AS expired,
         COUNT(*) FILTER (WHERE donation_offers.status = 'Removed') AS removed
       FROM donation_offers`,
    );

    // Subscriptions and credits of the current credit month (Europe/London).
    const periodMonth = creditMonth(new Date());
    const subscriptions = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE subscriptions.period_month = $1) AS active_subscriptions,
         COUNT(*) FILTER (WHERE subscriptions.period_month = $1 AND subscriptions.auto_renew) AS auto_renew,
         COUNT(*) FILTER (WHERE subscriptions.period_month = $2) AS next_month_subscriptions
       FROM subscriptions
       WHERE subscriptions.status = 'ACTIVE'`,
      [periodMonth, nextMonth(periodMonth)],
    );
    const byPlan = await pool.query(
      `SELECT plans.name AS plan, COUNT(subscriptions.id)::int AS count
       FROM plans
       LEFT JOIN subscriptions ON subscriptions.plan_id = plans.id
         AND subscriptions.period_month = $1 AND subscriptions.status = 'ACTIVE'
       WHERE plans.is_active
       GROUP BY plans.id, plans.name, plans.credits_per_period
       ORDER BY plans.credits_per_period`,
      [periodMonth],
    );
    const creditCounts = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users
          WHERE users.role = 'STORE' AND ${notBlocked("users")}
            AND NOT EXISTS (
              SELECT 1 FROM subscriptions
              WHERE subscriptions.user_id = users.id AND subscriptions.period_month = $1
                AND subscriptions.status = 'ACTIVE'
            )) AS without_subscription,
         (SELECT COUNT(*) FROM credit_requests WHERE credit_requests.status = 'PENDING') AS pending_requests`,
      [periodMonth],
    );

    const toNumbers = (row: Record<string, string>) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
    const orderCounts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
    for (const row of orders.rows) {
      orderCounts[row.status] = Number(row.count);
    }

    return res.status(200).json({
      stats: {
        users: toNumbers(users.rows[0]),
        products: toNumbers(products.rows[0]),
        orders: orderCounts,
        saved,
        donations: toNumbers(donations.rows[0]),
        credits: {
          period_start: periodMonth,
          ...toNumbers(subscriptions.rows[0]),
          ...toNumbers(creditCounts.rows[0]),
          by_plan: byPlan.rows,
          credits_used: await getPlatformUsage(pool),
        },
      },
    });
  } catch (error) {
    console.error("Error while fetching statistics:", error);
    return res.status(500).json({ error: "An error occurred while fetching statistics." });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  const { role, q, city_id, blocked } = req.query;
  const page = parsePage(req.query, ADMIN_PAGE_SIZE);
  const orderBy = parseSort(req.query, USER_SORTS, "users.created_at DESC, users.id DESC", "users.id DESC");
  if (!page || !orderBy) {
    return res.status(400).json({ error: "Invalid filter." });
  }

  let from = "FROM users WHERE true";
  const values: (string | number | boolean)[] = [];
  if (role) {
    if (typeof role !== "string" || !ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    values.push(role);
    from += ` AND users.role = $${values.length}`;
  }
  if (blocked) {
    if (blocked !== "true" && blocked !== "false") {
      return res.status(400).json({ error: "Invalid filter." });
    }
    // Blocked on its own or through its company: the accounts that cannot log in.
    from += blocked === "true" ? ` AND NOT ${notBlocked("users")}` : ` AND ${notBlocked("users")}`;
  }
  if (q) {
    values.push(`%${q}%`);
    from += ` AND (users.email ILIKE $${values.length} OR users.business_name ILIKE $${values.length}
      OR users.first_name ILIKE $${values.length} OR users.last_name ILIKE $${values.length}
      OR EXISTS (SELECT 1 FROM companies
                 WHERE companies.id = users.company_id AND companies.name ILIKE $${values.length}))`;
  }

  try {
    const cityFilter = await parseCityFilter(pool, city_id);
    if ("invalid" in cityFilter) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    if (cityFilter.cityId !== null) {
      values.push(cityFilter.cityId);
      from += ` AND users.city_id = $${values.length}`;
    }

    const { rows, total } = await listPage(
      USER_COLUMNS,
      from,
      orderBy,
      values,
      page,
    );
    return res.status(200).json({ users: rows, total });
  } catch (error) {
    console.error("Error while fetching users:", error);
    return res.status(500).json({ error: "An error occurred while fetching users." });
  }
};

export const getUserDetails = async (req: Request, res: Response) => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "User not found." });
  }
  try {
    const user = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE users.id = $1`, [targetId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM products
          WHERE products.store_id = $1 AND products.status != 'Removed') AS products,
         (SELECT COUNT(*) FROM products
          WHERE products.store_id = $1 AND products.status = 'Available'
            AND products.expiry_date >= CURRENT_DATE) AS active_products,
         (SELECT COUNT(*) FROM orders
          WHERE orders.store_id = $1 OR orders.restaurant_id = $1) AS orders,
         (SELECT COUNT(*) FROM orders
          WHERE (orders.store_id = $1 OR orders.restaurant_id = $1)
            AND orders.status = 'Pending') AS pending_orders,
         (SELECT COUNT(*) FROM orders
          WHERE (orders.store_id = $1 OR orders.restaurant_id = $1)
            AND orders.status = 'Completed') AS completed_orders,
         (SELECT COUNT(*) FROM donation_offers
          WHERE donation_offers.donor_id = $1 AND donation_offers.status != 'Removed') AS donations`,
      [targetId],
    );
    const countsRow = counts.rows[0];
    const actions = await pool.query(
      `SELECT admin_actions.id, admin_actions.action, admin_actions.reason, admin_actions.created_at,
         admin_actions.target_product_id, admin_actions.target_donation_id, admin_actions.target_reservation_id,
         admin_actions.target_order_id,
         admins.email AS admin_email, products.name AS product_name, donation_offers.name AS donation_name
       FROM admin_actions
       JOIN users AS admins ON admin_actions.admin_id = admins.id
       LEFT JOIN products ON admin_actions.target_product_id = products.id
       LEFT JOIN donation_offers ON admin_actions.target_donation_id = donation_offers.id
       -- A cancelled order (or an old cancelled reservation) targets the restaurant; the store sees
       -- it through the order (or the product).
       WHERE admin_actions.target_user_id = $1
          OR (admin_actions.action = 'CANCEL_RESERVATION' AND products.store_id = $1)
          OR (admin_actions.action = 'CANCEL_ORDER'
              AND admin_actions.target_order_id IN (SELECT orders.id FROM orders WHERE orders.store_id = $1))
       ORDER BY admin_actions.created_at DESC, admin_actions.id DESC
       LIMIT $2`,
      [targetId, RECENT_ACTIONS_LIMIT],
    );
    // What the user did to their own account (account_events), e.g. a password reset by email.
    const events = await pool.query(
      `SELECT account_events.id, account_events.event, account_events.ip, account_events.created_at
       FROM account_events
       WHERE account_events.user_id = $1
       ORDER BY account_events.created_at DESC, account_events.id DESC
       LIMIT $2`,
      [targetId, RECENT_ACTIONS_LIMIT],
    );

    return res.status(200).json({
      user: user.rows[0],
      counts: Object.fromEntries(
        Object.entries(countsRow).map(([key, value]) => [key, Number(value)]),
      ),
      actions: actions.rows,
      events: events.rows,
    });
  } catch (error) {
    console.error("Error while fetching users:", error);
    return res.status(500).json({ error: "An error occurred while fetching users." });
  }
};

// An admin creates store, restaurant and admin accounts with only an email and how the user gets
// in (an invitation, the default, or a temporary password; see parseCreateMethod). The user fills
// in the name and business data on the profile page.
export const createUser = async (req: Request, res: Response) => {
  const { role, email, password } = req.body;
  const method = parseCreateMethod(req.body);
  if (!role || !email) {
    return res.status(400).json({ error: "Email and role are required." });
  }
  if (role === "COMPANY") {
    return res.status(400).json({ error: "Company accounts are created on the Companies page." });
  }
  if (typeof role !== "string" || !USER_CREATED_ROLES.includes(role)) {
    return res.status(400).json({ error: "Role must be STORE, RESTAURANT or ADMIN." });
  }
  if (!method) {
    return res.status(400).json({ error: INVALID_CREATE_METHOD });
  }
  const invite = method === "INVITE";
  const credentialsError = validateEmail(email) ?? (invite ? null : validatePassword(password));
  if (credentialsError) {
    return res.status(400).json({ error: credentialsError });
  }

  let client;
  try {
    const normalized = normalizeEmail(email);
    const passwordHash = await initialPasswordHash(method, password);
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      // A temporary password was chosen by the admin, so the user must replace it at the first login.
      `INSERT INTO users (email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [normalized, passwordHash, role, !invite],
    );
    const user = result.rows[0];
    await logAdminAction(client, { adminId: req.user!.id, action: "CREATE_USER", targetUserId: user.id });
    if (invite) {
      await sendInvitation(client, user.id, req.user!.id);
      await logAdminAction(client, { adminId: req.user!.id, action: "SEND_INVITATION", targetUserId: user.id });
    }
    await client.query("COMMIT");
    return res
      .status(201)
      .json({ message: invite ? "User created and invitation sent." : "User created successfully.", user });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      return res.status(400).json({ error: "A user with this email already exists." });
    }
    console.error("Error while creating user:", error);
    return res.status(500).json({ error: "An error occurred while creating the user." });
  } finally {
    if (client) client.release();
  }
};

// The target of an emailed link sent by an admin: it must exist and not be blocked (also through
// its company, or a deactivated branch), since a blocked account cannot use a link.
const lockLinkTarget = async (client: PoolClient, targetId: number) => {
  const result = await client.query<{ id: number; last_login_at: string | null; blocked: boolean }>(
    `SELECT users.id, users.last_login_at, NOT ${notBlocked("users")} AS blocked
     FROM users WHERE users.id = $1 FOR UPDATE OF users`,
    [targetId],
  );
  return result.rows[0] ?? null;
};

// POST /admin/users/:id/invitation: a new invitation link while the user has never logged in (the
// old link stops working).
export const resendInvitation = (req: Request, res: Response) =>
  sendAccountLink(req, res, "invitation");

// POST /admin/users/:id/password-reset-link: emails the user a link to set a new password, like
// the forgot password page (an alternative to setting a temporary password).
export const sendResetLink = (req: Request, res: Response) => sendAccountLink(req, res, "reset");

const sendAccountLink = async (req: Request, res: Response, kind: "invitation" | "reset") => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "User not found." });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const target = await lockLinkTarget(client, targetId);
    if (!target) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    if (target.blocked) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "A blocked account cannot get a link." });
    }
    if (kind === "invitation" && target.last_login_at !== null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "The user has already logged in." });
    }
    if (kind === "invitation") await sendInvitation(client, targetId, req.user!.id);
    else await sendPasswordResetLink(client, targetId, req.user!.id);
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: kind === "invitation" ? "RESEND_INVITATION" : "SEND_PASSWORD_RESET_LINK",
      targetUserId: targetId,
    });
    await client.query("COMMIT");
    return res.status(200).json({ message: kind === "invitation" ? "Invitation sent." : "Password reset link sent." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while sending an account link:", error);
    return res.status(500).json({ error: "An error occurred while sending the link." });
  } finally {
    if (client) client.release();
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "User not found." });
  }
  const passwordError = validatePassword(req.body.password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  let client;
  try {
    const passwordHash = await hashPassword(req.body.password);
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE users SET password_hash = $1, must_change_password = true WHERE users.id = $2 RETURNING users.id",
      [passwordHash, targetId],
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    await logAdminAction(client, { adminId: req.user!.id, action: "RESET_PASSWORD", targetUserId: targetId });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while changing password:", error);
    return res.status(500).json({ error: "An error occurred while changing the password." });
  } finally {
    if (client) client.release();
  }
};

// Blocking signs the user out at once (authenticate reads is_blocked), hides a store's offers
// and cancels the user's Pending orders on both sides. An admin cannot block their own
// account, so at least one active admin always remains.
export const blockUser = async (req: Request, res: Response) => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "User not found." });
  }
  const reason = parseReason(req.body.reason);
  if (!reason) {
    return res.status(400).json({ error: REASON_ERROR });
  }
  if (targetId === req.user!.id) {
    return res.status(400).json({ error: "You cannot block your own account." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT users.id, users.is_blocked FROM users WHERE users.id = $1 FOR UPDATE",
      [targetId],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    if (existing.rows[0].is_blocked) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Account is already blocked." });
    }

    const result = await client.query(
      `UPDATE users SET is_blocked = true, blocked_at = NOW(), blocked_reason = $1
       WHERE users.id = $2 RETURNING ${USER_COLUMNS}`,
      [reason, targetId],
    );
    // The other party of each order is told; the blocked user cannot sign in anyway.
    const cancelledOrders = await cancelPendingOrders(
      client,
      "orders.restaurant_id = $1 OR orders.store_id = $1",
      [targetId],
      (order) => (order.restaurant_id === targetId ? order.store_id : order.restaurant_id),
    );
    const blocked = result.rows[0];
    // A branch's headquarters learns it was blocked, with the reason.
    if (blocked.role === "STORE") await notifyCompanyHq(client, blocked, "BRANCH_BLOCKED", reason);
    await logAdminAction(client, { adminId: req.user!.id, action: "BLOCK_USER", targetUserId: targetId, reason });
    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Account blocked.", user: result.rows[0], cancelledOrders });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while blocking user:", error);
    return res.status(500).json({ error: "An error occurred while blocking the user." });
  } finally {
    if (client) client.release();
  }
};

export const unblockUser = async (req: Request, res: Response) => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "User not found." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT users.is_blocked FROM users WHERE users.id = $1 FOR UPDATE",
      [targetId],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    if (!existing.rows[0].is_blocked) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Account is not blocked." });
    }
    const result = await client.query(
      `UPDATE users SET is_blocked = false, blocked_at = NULL, blocked_reason = NULL
       WHERE users.id = $1 RETURNING ${USER_COLUMNS}`,
      [targetId],
    );
    if (result.rows[0].role === "STORE") await notifyCompanyHq(client, result.rows[0], "BRANCH_UNBLOCKED");
    await logAdminAction(client, { adminId: req.user!.id, action: "UNBLOCK_USER", targetUserId: targetId });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Account unblocked.", user: result.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while unblocking user:", error);
    return res.status(500).json({ error: "An error occurred while unblocking the user." });
  } finally {
    if (client) client.release();
  }
};

export const getAdminProducts = async (req: Request, res: Response) => {
  const { q, status, store_id } = req.query;
  const page = parsePage(req.query, ADMIN_PAGE_SIZE);
  const orderBy = parseSort(req.query, PRODUCT_SORTS, "products.created_at DESC, products.id DESC", "products.id DESC");
  if (!page || !orderBy) {
    return res.status(400).json({ error: "Invalid filter." });
  }

  let from = "FROM products JOIN users ON products.store_id = users.id WHERE true";
  const values: (string | number | boolean)[] = [];
  if (status) {
    if (typeof status !== "string" || !PRODUCT_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    values.push(status);
    from += ` AND products.status = $${values.length}`;
  }
  if (store_id) {
    const storeId = parseId(store_id);
    if (storeId === null) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    values.push(storeId);
    from += ` AND products.store_id = $${values.length}`;
  }
  if (q) {
    values.push(`%${q}%`);
    from += ` AND (products.name ILIKE $${values.length} OR users.business_name ILIKE $${values.length})`;
  }

  try {
    const { rows, total } = await listPage(
      `products.id, products.store_id, products.name, products.category, products.quantity,
       products.unit, products.original_price, products.discounted_price, products.expiry_date,
       products.status, products.created_at, users.business_name, users.email AS store_email,
       NOT ${notBlocked("users")} AS store_is_blocked`,
      from,
      orderBy,
      values,
      page,
    );
    return res.status(200).json({ products: rows, total });
  } catch (error) {
    console.error("Error while fetching products:", error);
    return res.status(500).json({ error: "An error occurred while fetching products." });
  }
};

// Moderation: the product leaves the marketplace, its Pending order items are cancelled (a whole
// order when the restaurant did not accept partial fulfilment or nothing is left) and the store is
// told why. Confirmed items stay for the store to hand over.
export const removeProduct = async (req: Request, res: Response) => {
  const productId = parseId(req.params.id);
  if (productId === null) {
    return res.status(404).json({ error: "Product not found." });
  }
  const reason = parseReason(req.body.reason);
  if (!reason) {
    return res.status(400).json({ error: REASON_ERROR });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // The orders holding it first, then the product (the order paths' lock order).
    const orders = await lockOrdersHoldingProducts(client, [productId]);
    const existing = await client.query(
      "SELECT products.id, products.store_id, products.name, products.status FROM products WHERE products.id = $1 FOR UPDATE",
      [productId],
    );
    const product = existing.rows[0];
    if (!product) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found." });
    }
    if (product.status === "Removed") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Product is already removed." });
    }

    await cancelPendingItemsOfProducts(client, orders, [productId], "REMOVED", {
      source: "ADMIN",
      actorId: req.user!.id,
      reason,
    });
    // No refund for the store: the product broke the rules, so its credit stays spent.
    const result = await client.query(
      "UPDATE products SET status = 'Removed' WHERE products.id = $1 RETURNING *",
      [productId],
    );
    await createNotification(client, {
      userId: product.store_id,
      type: "PRODUCT_REMOVED_BY_ADMIN",
      message: `Your product was removed by the platform administrator: ${product.name}`,
      productId,
      details: reason,
    });
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "REMOVE_PRODUCT",
      targetUserId: product.store_id,
      targetProductId: productId,
      reason,
    });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Product removed.", product: result.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while removing product:", error);
    return res.status(500).json({ error: "An error occurred while removing the product." });
  } finally {
    if (client) client.release();
  }
};

export const getAdminDonations = async (req: Request, res: Response) => {
  const { q, status, type, donor_id } = req.query;
  const page = parsePage(req.query, ADMIN_PAGE_SIZE);
  const orderBy = parseSort(
    req.query,
    DONATION_SORTS,
    "donation_offers.created_at DESC, donation_offers.id DESC",
    "donation_offers.id DESC",
  );
  if (!page || !orderBy) {
    return res.status(400).json({ error: "Invalid filter." });
  }

  let from = "FROM donation_offers JOIN users ON donation_offers.donor_id = users.id WHERE true";
  const values: (string | number | boolean)[] = [];
  if (status) {
    if (typeof status !== "string" || !DONATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    values.push(status);
    from += ` AND donation_offers.status = $${values.length}`;
  }
  if (type) {
    if (typeof type !== "string" || !DONATION_TYPES.includes(type)) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    values.push(type);
    from += ` AND donation_offers.donation_type = $${values.length}`;
  }
  if (donor_id) {
    const donorId = parseId(donor_id);
    if (donorId === null) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    values.push(donorId);
    from += ` AND donation_offers.donor_id = $${values.length}`;
  }
  if (q) {
    values.push(`%${q}%`);
    from += ` AND (donation_offers.name ILIKE $${values.length} OR users.business_name ILIKE $${values.length})`;
  }

  try {
    const { rows, total } = await listPage(
      `donation_offers.id, donation_offers.donor_id, donation_offers.donation_type, donation_offers.name,
       donation_offers.category, donation_offers.quantity, donation_offers.unit,
       donation_offers.original_price, donation_offers.donation_price, donation_offers.expiry_date,
       donation_offers.status, donation_offers.created_at, users.business_name,
       users.email AS donor_email, users.role AS donor_role`,
      from,
      orderBy,
      values,
      page,
    );
    return res.status(200).json({ donations: rows, total });
  } catch (error) {
    console.error("Error while fetching donations:", error);
    return res.status(500).json({ error: "An error occurred while fetching donations." });
  }
};

export const removeDonation = async (req: Request, res: Response) => {
  const donationId = parseId(req.params.id);
  if (donationId === null) {
    return res.status(404).json({ error: "Donation not found." });
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
      `SELECT donation_offers.id, donation_offers.donor_id, donation_offers.name, donation_offers.status
       FROM donation_offers WHERE donation_offers.id = $1 FOR UPDATE`,
      [donationId],
    );
    const donation = existing.rows[0];
    if (!donation) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Donation not found." });
    }
    if (donation.status === "Removed") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Donation is already removed." });
    }

    await client.query("UPDATE donation_offers SET status = 'Removed' WHERE donation_offers.id = $1", [
      donationId,
    ]);
    await createNotification(client, {
      userId: donation.donor_id,
      type: "DONATION_REMOVED_BY_ADMIN",
      message: `Your donation was removed by the platform administrator: ${donation.name}`,
      donationId,
      details: reason,
    });
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "REMOVE_DONATION",
      targetUserId: donation.donor_id,
      targetDonationId: donationId,
      reason,
    });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Donation removed." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while removing donation:", error);
    return res.status(500).json({ error: "An error occurred while removing the donation." });
  } finally {
    if (client) client.release();
  }
};

export const getAdminActions = async (req: Request, res: Response) => {
  const { admin_id, action, target_user_id } = req.query;
  const page = parsePage(req.query, ADMIN_PAGE_SIZE);
  if (!page) {
    return res.status(400).json({ error: "Invalid filter." });
  }

  let from = `FROM admin_actions
    JOIN users AS admins ON admin_actions.admin_id = admins.id
    LEFT JOIN users AS targets ON admin_actions.target_user_id = targets.id
    LEFT JOIN products ON admin_actions.target_product_id = products.id
    LEFT JOIN donation_offers ON admin_actions.target_donation_id = donation_offers.id
    LEFT JOIN announcements ON admin_actions.target_announcement_id = announcements.id
    LEFT JOIN companies ON admin_actions.target_company_id = companies.id
    WHERE true`;
  const values: (string | number | boolean)[] = [];
  if (action) {
    if (typeof action !== "string" || !ADMIN_ACTIONS.includes(action)) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    values.push(action);
    from += ` AND admin_actions.action = $${values.length}`;
  }
  for (const [param, column] of [
    [admin_id, "admin_actions.admin_id"],
    [target_user_id, "admin_actions.target_user_id"],
  ] as const) {
    if (!param) continue;
    const id = parseId(param);
    if (id === null) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    values.push(id);
    from += ` AND ${column} = $${values.length}`;
  }

  try {
    const { rows, total } = await listPage(
      `admin_actions.id, admin_actions.action, admin_actions.reason, admin_actions.created_at,
       admin_actions.admin_id, admins.email AS admin_email,
       admin_actions.target_user_id, targets.email AS target_email, targets.business_name AS target_business_name,
       admin_actions.target_product_id, products.name AS product_name,
       admin_actions.target_donation_id, donation_offers.name AS donation_name,
       admin_actions.target_reservation_id,
       admin_actions.target_announcement_id, announcements.title_bs AS announcement_title,
       admin_actions.target_credit_request_id,
       admin_actions.target_company_id, companies.name AS company_name`,
      from,
      "admin_actions.created_at DESC, admin_actions.id DESC",
      values,
      page,
    );
    return res.status(200).json({ actions: rows, total });
  } catch (error) {
    console.error("Error while fetching admin actions:", error);
    return res.status(500).json({ error: "An error occurred while fetching admin actions." });
  }
};

// The admin corrects a user's name and business data (the logo stays the user's own).
export const updateUserProfile = async (req: Request, res: Response) => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "User not found." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const existing = await client.query<{ role: Role }>(
      "SELECT users.role FROM users WHERE users.id = $1 FOR UPDATE",
      [targetId],
    );
    const target = existing.rows[0];
    if (!target) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    const { logo_url: _logo, ...fields } = req.body;
    const result = await updateProfile(client, targetId, target.role, fields);
    if (result.error) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: result.error });
    }
    await logAdminAction(client, { adminId: req.user!.id, action: "UPDATE_PROFILE", targetUserId: targetId });
    const user = await client.query(`SELECT ${USER_COLUMNS} FROM users WHERE users.id = $1`, [targetId]);
    await client.query("COMMIT");
    return res.status(200).json({ message: "User profile updated.", user: user.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while editing user profile:", error);
    return res.status(500).json({ error: "An error occurred while editing the profile." });
  } finally {
    if (client) client.release();
  }
};

const MAX_ANNOUNCEMENT_TITLE = 120;
const MAX_ANNOUNCEMENT_BODY = 1000;

const ANNOUNCEMENT_COLUMNS = `announcements.id, announcements.audience, announcements.title_bs,
  announcements.body_bs, announcements.title_en, announcements.body_en, announcements.expires_at,
  announcements.ended_at, announcements.created_at`;

// Validates and trims an announcement; English is optional but needs both a title and a body.
const parseAnnouncement = (body: Record<string, unknown>) => {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const audience = body.audience;
  const fields = {
    title_bs: text(body.title_bs),
    body_bs: text(body.body_bs),
    title_en: text(body.title_en),
    body_en: text(body.body_en),
  };
  if (typeof audience !== "string" || !ANNOUNCEMENT_AUDIENCES.includes(audience)) {
    return { error: "Audience is not valid." };
  }
  if (!fields.title_bs || !fields.body_bs) {
    return { error: "Title and text are required." };
  }
  if (Boolean(fields.title_en) !== Boolean(fields.body_en)) {
    return { error: "For the English translation, enter both the title and the text." };
  }
  if (fields.title_bs.length > MAX_ANNOUNCEMENT_TITLE || fields.title_en.length > MAX_ANNOUNCEMENT_TITLE) {
    return { error: `Title can be at most ${MAX_ANNOUNCEMENT_TITLE} characters long.` };
  }
  if (fields.body_bs.length > MAX_ANNOUNCEMENT_BODY || fields.body_en.length > MAX_ANNOUNCEMENT_BODY) {
    return { error: `Text can be at most ${MAX_ANNOUNCEMENT_BODY} characters long.` };
  }
  let expiresAt: string | null = null;
  if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== "") {
    if (!isValidDateTime(body.expires_at) || new Date(body.expires_at as string).getTime() <= Date.now()) {
      return { error: "Expiry date must be in the future." };
    }
    expiresAt = body.expires_at as string;
  }
  return { announcement: { ...fields, audience, expires_at: expiresAt } };
};

// Sends the announcement to every unblocked store and/or restaurant as a notification, in one
// statement; admins never receive it.
export const createAnnouncement = async (req: Request, res: Response) => {
  const parsed = parseAnnouncement(req.body);
  if (!parsed.announcement) {
    return res.status(400).json({ error: parsed.error });
  }
  const fields = parsed.announcement;
  // A company's headquarters belongs to the store side, so it gets store announcements too.
  const roles =
    fields.audience === "ALL"
      ? ["STORE", "RESTAURANT", "COMPANY"]
      : fields.audience === "STORE"
        ? ["STORE", "COMPANY"]
        : [fields.audience];

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO announcements (admin_id, audience, title_bs, body_bs, title_en, body_en, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${ANNOUNCEMENT_COLUMNS}`,
      [
        req.user!.id,
        fields.audience,
        fields.title_bs,
        fields.body_bs,
        fields.title_en || null,
        fields.body_en || null,
        fields.expires_at,
      ],
    );
    const announcement = result.rows[0];
    const recipients = await notifyAnnouncement(
      client,
      announcement.id,
      `Platform announcement: ${fields.title_en || fields.title_bs}`,
      roles,
    );
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "CREATE_ANNOUNCEMENT",
      targetAnnouncementId: announcement.id,
    });
    await client.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Announcement sent.", announcement, recipients });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while sending announcement:", error);
    return res.status(500).json({ error: "An error occurred while sending the announcement." });
  } finally {
    if (client) client.release();
  }
};

export const getAnnouncements = async (req: Request, res: Response) => {
  const page = parsePage(req.query, ADMIN_PAGE_SIZE);
  if (!page) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    const { rows, total } = await listPage(
      `${ANNOUNCEMENT_COLUMNS}, admins.email AS admin_email,
       announcements.ended_at IS NULL
         AND (announcements.expires_at IS NULL OR announcements.expires_at > NOW()) AS is_active,
       (SELECT COUNT(*) FROM notifications
        WHERE notifications.announcement_id = announcements.id)::int AS recipients,
       (SELECT COUNT(*) FROM announcement_dismissals
        WHERE announcement_dismissals.announcement_id = announcements.id)::int AS dismissed`,
      "FROM announcements JOIN users AS admins ON announcements.admin_id = admins.id",
      "announcements.created_at DESC, announcements.id DESC",
      [],
      page,
    );
    return res.status(200).json({ announcements: rows, total });
  } catch (error) {
    console.error("Error while fetching announcements:", error);
    return res.status(500).json({ error: "An error occurred while fetching announcements." });
  }
};

export const endAnnouncement = async (req: Request, res: Response) => {
  const announcementId = parseId(req.params.id);
  if (announcementId === null) {
    return res.status(404).json({ error: "Announcement not found." });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT announcements.ended_at IS NULL
         AND (announcements.expires_at IS NULL OR announcements.expires_at > NOW()) AS is_active
       FROM announcements WHERE announcements.id = $1 FOR UPDATE`,
      [announcementId],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Announcement not found." });
    }
    if (!existing.rows[0].is_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Announcement has already ended." });
    }
    await client.query("UPDATE announcements SET ended_at = NOW() WHERE announcements.id = $1", [announcementId]);
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "END_ANNOUNCEMENT",
      targetAnnouncementId: announcementId,
    });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Announcement ended." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while ending announcement:", error);
    return res.status(500).json({ error: "An error occurred while ending the announcement." });
  } finally {
    if (client) client.release();
  }
};
