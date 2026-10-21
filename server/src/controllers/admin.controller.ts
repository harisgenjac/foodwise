import pool from "../config/db.js";
import type { Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { createNotification } from "../utils/notifications.js";
import { parseId, parseNonNegativeInt } from "../utils/params.js";
import {
  hashPassword,
  isUniqueViolation,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "../utils/accounts.js";
import { PRODUCT_STATUSES } from "./products.controller.js";
import { DONATION_STATUSES, DONATION_TYPES } from "../utils/validateDonation.js";
import { RESERVATION_STATUSES, lockReservation, releaseSoldProduct } from "./reservations.controller.js";
import { updateProfile } from "./users.controller.js";
import { isValidDateTime } from "../utils/dates.js";
import type { Role } from "../types/auth.js";

export const ROLES = ["STORE", "RESTAURANT", "ADMIN"];
export const ADMIN_ACTIONS = [
  "CREATE_USER",
  "RESET_PASSWORD",
  "BLOCK_USER",
  "UNBLOCK_USER",
  "REMOVE_PRODUCT",
  "REMOVE_DONATION",
  "CANCEL_RESERVATION",
  "UPDATE_PROFILE",
  "CREATE_ANNOUNCEMENT",
  "END_ANNOUNCEMENT",
];
export const ANNOUNCEMENT_AUDIENCES = ["ALL", "STORE", "RESTAURANT"];

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_REASON_LENGTH = 500;
const RECENT_ACTIONS_LIMIT = 20;

const USER_COLUMNS = `users.id, users.email, users.role, users.first_name, users.last_name,
  users.business_name, users.city, users.address, users.phone, users.logo_url,
  users.opening_hours, users.pickup_hours, users.description,
  users.is_blocked, users.blocked_at, users.blocked_reason, users.must_change_password, users.created_at`;

interface AdminAction {
  adminId: number;
  action: string;
  targetUserId?: number | null;
  targetProductId?: number | null;
  targetDonationId?: number | null;
  targetReservationId?: number | null;
  targetAnnouncementId?: number | null;
  reason?: string | null;
}

// Every admin action is written to the audit log, inside the action's transaction when it has one.
const logAdminAction = async (
  db: Pool | PoolClient,
  {
    adminId,
    action,
    targetUserId = null,
    targetProductId = null,
    targetDonationId = null,
    targetReservationId = null,
    targetAnnouncementId = null,
    reason = null,
  }: AdminAction,
) => {
  await db.query(
    `INSERT INTO admin_actions
       (admin_id, action, target_user_id, target_product_id, target_donation_id, target_reservation_id,
        target_announcement_id, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      adminId,
      action,
      targetUserId,
      targetProductId,
      targetDonationId,
      targetReservationId,
      targetAnnouncementId,
      reason,
    ],
  );
};

// A trimmed reason, or null when it is missing or too long.
const parseReason = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason && reason.length <= MAX_REASON_LENGTH ? reason : null;
};
const REASON_ERROR = `Razlog je obavezan (najviše ${MAX_REASON_LENGTH} znakova).`;

const parsePage = (query: Request["query"]) => {
  const limit = query.limit === undefined ? DEFAULT_PAGE_SIZE : parseNonNegativeInt(query.limit);
  const offset = query.offset === undefined ? 0 : parseNonNegativeInt(query.offset);
  if (limit === null || limit === 0 || limit > MAX_PAGE_SIZE || offset === null) return null;
  return { limit, offset };
};

// Runs a filtered list query and its total count; `from` is everything after SELECT ... .
const listPage = async (
  columns: string,
  from: string,
  orderBy: string,
  values: (string | number | boolean)[],
  page: { limit: number; offset: number },
) => {
  const total = await pool.query(`SELECT COUNT(*) AS total ${from}`, values);
  const result = await pool.query(
    `SELECT ${columns} ${from}
     ORDER BY ${orderBy}
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, page.limit, page.offset],
  );
  return { rows: result.rows, total: parseInt(total.rows[0].total, 10) };
};

export const getStats = async (req: Request, res: Response) => {
  try {
    const users = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE users.role = 'STORE') AS stores,
         COUNT(*) FILTER (WHERE users.role = 'RESTAURANT') AS restaurants,
         COUNT(*) FILTER (WHERE users.role = 'ADMIN') AS admins,
         COUNT(*) FILTER (WHERE users.is_blocked) AS blocked,
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
    const reservations = await pool.query(
      `SELECT reservations.status, COUNT(*) AS count FROM reservations GROUP BY reservations.status`,
    );
    // Same units as the impact report: g/kg as kg, ml/l as l, kom and pak as pieces.
    const saved = await pool.query(
      `SELECT
         COALESCE(SUM(CASE products.unit
           WHEN 'kg' THEN reservations.quantity
           WHEN 'g' THEN reservations.quantity / 1000 END), 0) AS kg,
         COALESCE(SUM(CASE products.unit
           WHEN 'l' THEN reservations.quantity
           WHEN 'ml' THEN reservations.quantity / 1000 END), 0) AS l,
         COALESCE(SUM(CASE WHEN products.unit IN ('kom', 'pak') THEN reservations.quantity END), 0) AS pieces,
         COALESCE(ROUND(SUM(reservations.unit_price * reservations.quantity), 2), 0) AS value,
         COALESCE(ROUND(SUM(GREATEST(products.original_price - reservations.unit_price, 0) * reservations.quantity), 2), 0) AS savings
       FROM reservations
       JOIN products ON reservations.product_id = products.id
       WHERE reservations.status = 'Completed'`,
    );
    const donations = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE donation_offers.status = 'Available') AS available,
         COUNT(*) FILTER (WHERE donation_offers.status = 'Expired') AS expired,
         COUNT(*) FILTER (WHERE donation_offers.status = 'Removed') AS removed
       FROM donation_offers`,
    );

    const toNumbers = (row: Record<string, string>) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
    const reservationCounts = Object.fromEntries(
      ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"].map((status) => [status, 0]),
    );
    for (const row of reservations.rows) {
      reservationCounts[row.status] = Number(row.count);
    }

    return res.status(200).json({
      stats: {
        users: toNumbers(users.rows[0]),
        products: toNumbers(products.rows[0]),
        reservations: reservationCounts,
        saved: toNumbers(saved.rows[0]),
        donations: toNumbers(donations.rows[0]),
      },
    });
  } catch (error) {
    console.error("Greška prilikom dohvatanja statistike:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom dohvatanja statistike." });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  const { role, q, city, blocked } = req.query;
  const page = parsePage(req.query);
  if (!page) {
    return res.status(400).json({ error: "Neispravan filter." });
  }

  let from = "FROM users WHERE true";
  const values: (string | number | boolean)[] = [];
  if (role) {
    if (typeof role !== "string" || !ROLES.includes(role)) {
      return res.status(400).json({ error: "Neispravan filter." });
    }
    values.push(role);
    from += ` AND users.role = $${values.length}`;
  }
  if (blocked) {
    if (blocked !== "true" && blocked !== "false") {
      return res.status(400).json({ error: "Neispravan filter." });
    }
    values.push(blocked === "true");
    from += ` AND users.is_blocked = $${values.length}`;
  }
  if (q) {
    values.push(`%${q}%`);
    from += ` AND (users.email ILIKE $${values.length} OR users.business_name ILIKE $${values.length}
      OR users.first_name ILIKE $${values.length} OR users.last_name ILIKE $${values.length})`;
  }
  if (city) {
    values.push(`%${city}%`);
    from += ` AND users.city ILIKE $${values.length}`;
  }

  try {
    const { rows, total } = await listPage(
      USER_COLUMNS,
      from,
      "users.created_at DESC, users.id DESC",
      values,
      page,
    );
    return res.status(200).json({ users: rows, total });
  } catch (error) {
    console.error("Greška prilikom dohvatanja korisnika:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom dohvatanja korisnika." });
  }
};

export const getUserDetails = async (req: Request, res: Response) => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "Korisnik nije pronađen." });
  }
  try {
    const user = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE users.id = $1`, [targetId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: "Korisnik nije pronađen." });
    }
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM products
          WHERE products.store_id = $1 AND products.status != 'Removed') AS products,
         (SELECT COUNT(*) FROM products
          WHERE products.store_id = $1 AND products.status = 'Available'
            AND products.expiry_date >= CURRENT_DATE) AS active_products,
         (SELECT COUNT(*) FROM reservations
          JOIN products ON reservations.product_id = products.id
          WHERE products.store_id = $1 OR reservations.restaurant_id = $1) AS reservations,
         (SELECT COUNT(*) FROM reservations
          JOIN products ON reservations.product_id = products.id
          WHERE (products.store_id = $1 OR reservations.restaurant_id = $1)
            AND reservations.status = 'Pending') AS pending_reservations,
         (SELECT COUNT(*) FROM reservations
          JOIN products ON reservations.product_id = products.id
          WHERE (products.store_id = $1 OR reservations.restaurant_id = $1)
            AND reservations.status = 'Completed') AS completed_reservations,
         (SELECT COUNT(*) FROM donation_offers
          WHERE donation_offers.donor_id = $1 AND donation_offers.status != 'Removed') AS donations`,
      [targetId],
    );
    const countsRow = counts.rows[0];
    const actions = await pool.query(
      `SELECT admin_actions.id, admin_actions.action, admin_actions.reason, admin_actions.created_at,
         admin_actions.target_product_id, admin_actions.target_donation_id, admin_actions.target_reservation_id,
         admins.email AS admin_email, products.name AS product_name, donation_offers.name AS donation_name
       FROM admin_actions
       JOIN users AS admins ON admin_actions.admin_id = admins.id
       LEFT JOIN products ON admin_actions.target_product_id = products.id
       LEFT JOIN donation_offers ON admin_actions.target_donation_id = donation_offers.id
       -- A cancelled reservation targets the restaurant; the store sees it through its product.
       WHERE admin_actions.target_user_id = $1
          OR (admin_actions.action = 'CANCEL_RESERVATION' AND products.store_id = $1)
       ORDER BY admin_actions.created_at DESC, admin_actions.id DESC
       LIMIT $2`,
      [targetId, RECENT_ACTIONS_LIMIT],
    );

    return res.status(200).json({
      user: user.rows[0],
      counts: Object.fromEntries(
        Object.entries(countsRow).map(([key, value]) => [key, Number(value)]),
      ),
      actions: actions.rows,
    });
  } catch (error) {
    console.error("Greška prilikom dohvatanja korisnika:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom dohvatanja korisnika." });
  }
};

// An admin creates store, restaurant and admin accounts with only an email and a password.
// The user fills in the name and business data on the profile page after the first login.
export const createUser = async (req: Request, res: Response) => {
  const { role, email, password } = req.body;
  if (!role || !email || !password) {
    return res.status(400).json({ error: "Email, lozinka i rola su obavezni." });
  }
  if (typeof role !== "string" || !ROLES.includes(role)) {
    return res.status(400).json({ error: "Rola mora biti STORE, RESTAURANT ili ADMIN." });
  }
  const credentialsError = validateEmail(email) ?? validatePassword(password);
  if (credentialsError) {
    return res.status(400).json({ error: credentialsError });
  }

  let client;
  try {
    const normalized = normalizeEmail(email);
    const passwordHash = await hashPassword(password);
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      // The admin chose this password, so the user must replace it at the first login.
      `INSERT INTO users (email, password_hash, role, must_change_password) VALUES ($1, $2, $3, true)
       RETURNING ${USER_COLUMNS}`,
      [normalized, passwordHash, role],
    );
    const user = result.rows[0];
    await logAdminAction(client, { adminId: req.user!.id, action: "CREATE_USER", targetUserId: user.id });
    await client.query("COMMIT");
    return res.status(201).json({ message: "Korisnik uspješno kreiran.", user });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      return res.status(400).json({ error: "Korisnik s tim emailom već postoji." });
    }
    console.error("Greška prilikom kreiranja korisnika:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom kreiranja korisnika." });
  } finally {
    if (client) client.release();
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "Korisnik nije pronađen." });
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
      return res.status(404).json({ error: "Korisnik nije pronađen." });
    }
    await logAdminAction(client, { adminId: req.user!.id, action: "RESET_PASSWORD", targetUserId: targetId });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Lozinka je uspješno promijenjena." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom promjene lozinke:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom promjene lozinke." });
  } finally {
    if (client) client.release();
  }
};

// Cancels the Pending reservations of `where` (locked first) and notifies `recipient` of each.
// Confirmed reservations are kept: the store already agreed to hand that food over.
const cancelPendingReservations = async (
  client: PoolClient,
  where: string,
  values: number[],
  recipient: (row: { store_id: number; restaurant_id: number }) => number,
) => {
  const pending = await client.query(
    `SELECT reservations.id, reservations.restaurant_id, reservations.quantity,
       products.id AS product_id, products.store_id, products.name, products.unit
     FROM reservations
     JOIN products ON reservations.product_id = products.id
     WHERE reservations.status = 'Pending' AND (${where})
     FOR UPDATE OF reservations`,
    values,
  );
  for (const row of pending.rows) {
    await client.query("UPDATE reservations SET status = 'Cancelled' WHERE reservations.id = $1", [row.id]);
    await createNotification(client, {
      userId: recipient(row),
      type: "RESERVATION_CANCELLED_BY_ADMIN",
      message: `Reservation cancelled by the platform administrator: ${Number(row.quantity)}${row.unit} ${row.name}`,
      reservationId: row.id,
      productId: row.product_id,
    });
  }
  return pending.rows.length;
};

// Blocking signs the user out at once (authenticate reads is_blocked), hides a store's offers
// and cancels the user's Pending reservations on both sides. An admin cannot block their own
// account, so at least one active admin always remains.
export const blockUser = async (req: Request, res: Response) => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "Korisnik nije pronađen." });
  }
  const reason = parseReason(req.body.reason);
  if (!reason) {
    return res.status(400).json({ error: REASON_ERROR });
  }
  if (targetId === req.user!.id) {
    return res.status(400).json({ error: "Ne možete blokirati vlastiti nalog." });
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
      return res.status(404).json({ error: "Korisnik nije pronađen." });
    }
    if (existing.rows[0].is_blocked) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Nalog je već blokiran." });
    }

    const result = await client.query(
      `UPDATE users SET is_blocked = true, blocked_at = NOW(), blocked_reason = $1
       WHERE users.id = $2 RETURNING ${USER_COLUMNS}`,
      [reason, targetId],
    );
    // The other party of each reservation is told; the blocked user cannot sign in anyway.
    const cancelledReservations = await cancelPendingReservations(
      client,
      "reservations.restaurant_id = $1 OR products.store_id = $1",
      [targetId],
      (row) => (row.restaurant_id === targetId ? row.store_id : row.restaurant_id),
    );
    await logAdminAction(client, { adminId: req.user!.id, action: "BLOCK_USER", targetUserId: targetId, reason });
    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Nalog je blokiran.", user: result.rows[0], cancelledReservations });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom blokiranja korisnika:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom blokiranja korisnika." });
  } finally {
    if (client) client.release();
  }
};

export const unblockUser = async (req: Request, res: Response) => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "Korisnik nije pronađen." });
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
      return res.status(404).json({ error: "Korisnik nije pronađen." });
    }
    if (!existing.rows[0].is_blocked) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Nalog nije blokiran." });
    }
    const result = await client.query(
      `UPDATE users SET is_blocked = false, blocked_at = NULL, blocked_reason = NULL
       WHERE users.id = $1 RETURNING ${USER_COLUMNS}`,
      [targetId],
    );
    await logAdminAction(client, { adminId: req.user!.id, action: "UNBLOCK_USER", targetUserId: targetId });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Nalog je deblokiran.", user: result.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom deblokiranja korisnika:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom deblokiranja korisnika." });
  } finally {
    if (client) client.release();
  }
};

export const getAdminProducts = async (req: Request, res: Response) => {
  const { q, status, store_id } = req.query;
  const page = parsePage(req.query);
  if (!page) {
    return res.status(400).json({ error: "Neispravan filter." });
  }

  let from = "FROM products JOIN users ON products.store_id = users.id WHERE true";
  const values: (string | number | boolean)[] = [];
  if (status) {
    if (typeof status !== "string" || !PRODUCT_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Neispravan filter." });
    }
    values.push(status);
    from += ` AND products.status = $${values.length}`;
  }
  if (store_id) {
    const storeId = parseId(store_id);
    if (storeId === null) {
      return res.status(400).json({ error: "Neispravan filter." });
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
       users.is_blocked AS store_is_blocked`,
      from,
      "products.created_at DESC, products.id DESC",
      values,
      page,
    );
    return res.status(200).json({ products: rows, total });
  } catch (error) {
    console.error("Greška prilikom dohvatanja proizvoda:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom dohvatanja proizvoda." });
  }
};

// Moderation: the product leaves the marketplace, its Pending reservations are cancelled and
// the store is told why. Confirmed reservations stay for the store to hand over.
export const removeProduct = async (req: Request, res: Response) => {
  const productId = parseId(req.params.id);
  if (productId === null) {
    return res.status(404).json({ error: "Proizvod nije pronađen." });
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
      "SELECT products.id, products.store_id, products.name, products.status FROM products WHERE products.id = $1 FOR UPDATE",
      [productId],
    );
    const product = existing.rows[0];
    if (!product) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Proizvod nije pronađen." });
    }
    if (product.status === "Removed") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Proizvod je već uklonjen." });
    }

    await cancelPendingReservations(
      client,
      "reservations.product_id = $1",
      [productId],
      (row) => row.restaurant_id,
    );
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
    return res.status(200).json({ message: "Proizvod je uklonjen.", product: result.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom uklanjanja proizvoda:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom uklanjanja proizvoda." });
  } finally {
    if (client) client.release();
  }
};

export const getAdminDonations = async (req: Request, res: Response) => {
  const { q, status, type, donor_id } = req.query;
  const page = parsePage(req.query);
  if (!page) {
    return res.status(400).json({ error: "Neispravan filter." });
  }

  let from = "FROM donation_offers JOIN users ON donation_offers.donor_id = users.id WHERE true";
  const values: (string | number | boolean)[] = [];
  if (status) {
    if (typeof status !== "string" || !DONATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Neispravan filter." });
    }
    values.push(status);
    from += ` AND donation_offers.status = $${values.length}`;
  }
  if (type) {
    if (typeof type !== "string" || !DONATION_TYPES.includes(type)) {
      return res.status(400).json({ error: "Neispravan filter." });
    }
    values.push(type);
    from += ` AND donation_offers.donation_type = $${values.length}`;
  }
  if (donor_id) {
    const donorId = parseId(donor_id);
    if (donorId === null) {
      return res.status(400).json({ error: "Neispravan filter." });
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
      "donation_offers.created_at DESC, donation_offers.id DESC",
      values,
      page,
    );
    return res.status(200).json({ donations: rows, total });
  } catch (error) {
    console.error("Greška prilikom dohvatanja donacija:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom dohvatanja donacija." });
  }
};

export const removeDonation = async (req: Request, res: Response) => {
  const donationId = parseId(req.params.id);
  if (donationId === null) {
    return res.status(404).json({ error: "Donacija nije pronađena." });
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
      return res.status(404).json({ error: "Donacija nije pronađena." });
    }
    if (donation.status === "Removed") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Donacija je već uklonjena." });
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
    return res.status(200).json({ message: "Donacija je uklonjena." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom uklanjanja donacije:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom uklanjanja donacije." });
  } finally {
    if (client) client.release();
  }
};

export const getAdminActions = async (req: Request, res: Response) => {
  const { admin_id, action, target_user_id } = req.query;
  const page = parsePage(req.query);
  if (!page) {
    return res.status(400).json({ error: "Neispravan filter." });
  }

  let from = `FROM admin_actions
    JOIN users AS admins ON admin_actions.admin_id = admins.id
    LEFT JOIN users AS targets ON admin_actions.target_user_id = targets.id
    LEFT JOIN products ON admin_actions.target_product_id = products.id
    LEFT JOIN donation_offers ON admin_actions.target_donation_id = donation_offers.id
    LEFT JOIN announcements ON admin_actions.target_announcement_id = announcements.id
    WHERE true`;
  const values: (string | number | boolean)[] = [];
  if (action) {
    if (typeof action !== "string" || !ADMIN_ACTIONS.includes(action)) {
      return res.status(400).json({ error: "Neispravan filter." });
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
      return res.status(400).json({ error: "Neispravan filter." });
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
       admin_actions.target_announcement_id, announcements.title_bs AS announcement_title`,
      from,
      "admin_actions.created_at DESC, admin_actions.id DESC",
      values,
      page,
    );
    return res.status(200).json({ actions: rows, total });
  } catch (error) {
    console.error("Greška prilikom dohvatanja admin akcija:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom dohvatanja admin akcija." });
  }
};

export const getAdminReservations = async (req: Request, res: Response) => {
  const { q, status, user_id } = req.query;
  const page = parsePage(req.query);
  if (!page) {
    return res.status(400).json({ error: "Neispravan filter." });
  }

  let from = `FROM reservations
    JOIN products ON reservations.product_id = products.id
    JOIN users AS stores ON products.store_id = stores.id
    JOIN users AS restaurants ON reservations.restaurant_id = restaurants.id
    WHERE true`;
  const values: (string | number | boolean)[] = [];
  if (status) {
    if (typeof status !== "string" || !RESERVATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Neispravan filter." });
    }
    values.push(status);
    from += ` AND reservations.status = $${values.length}`;
  }
  if (user_id) {
    const userId = parseId(user_id);
    if (userId === null) {
      return res.status(400).json({ error: "Neispravan filter." });
    }
    values.push(userId);
    from += ` AND (products.store_id = $${values.length} OR reservations.restaurant_id = $${values.length})`;
  }
  if (q) {
    values.push(`%${q}%`);
    const p = `$${values.length}`;
    from += ` AND (products.name ILIKE ${p} OR stores.business_name ILIKE ${p} OR stores.email ILIKE ${p}
      OR restaurants.business_name ILIKE ${p} OR restaurants.email ILIKE ${p})`;
  }

  try {
    const { rows, total } = await listPage(
      `reservations.id, reservations.status, reservations.quantity, reservations.unit_price,
       reservations.pickup_date, reservations.picked_up_at, reservations.created_at,
       reservations.status = 'Confirmed' AND reservations.pickup_date::date < CURRENT_DATE AS is_overdue,
       products.id AS product_id, products.name AS product_name, products.unit,
       stores.id AS store_id, stores.business_name AS store_name, stores.email AS store_email,
       restaurants.id AS restaurant_id, restaurants.business_name AS restaurant_name,
       restaurants.email AS restaurant_email`,
      from,
      "reservations.created_at DESC, reservations.id DESC",
      values,
      page,
    );
    return res.status(200).json({ reservations: rows, total });
  } catch (error) {
    console.error("Greška prilikom dohvatanja rezervacija:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom dohvatanja rezervacija." });
  }
};

// Resolves a dispute: a Pending or Confirmed reservation is cancelled and both sides are told why.
// Cancelling a Confirmed one puts its quantity back on offer (a product it sold out is available again).
export const cancelReservation = async (req: Request, res: Response) => {
  const reservationId = parseId(req.params.id);
  if (reservationId === null) {
    return res.status(404).json({ error: "Rezervacija nije pronađena." });
  }
  const reason = parseReason(req.body.reason);
  if (!reason) {
    return res.status(400).json({ error: REASON_ERROR });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await lockReservation(client, reservationId);
    const reservation = result.rows[0];
    if (!reservation) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Rezervacija nije pronađena." });
    }
    if (!["Pending", "Confirmed"].includes(reservation.status)) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Samo rezervacije na čekanju ili prihvaćene mogu biti otkazane." });
    }

    await client.query("UPDATE reservations SET status = 'Cancelled' WHERE reservations.id = $1", [reservationId]);
    if (reservation.status === "Confirmed") {
      await releaseSoldProduct(client, reservation.product_id);
    }
    for (const userId of [reservation.store_id, reservation.restaurant_id]) {
      await createNotification(client, {
        userId,
        type: "RESERVATION_CANCELLED_BY_ADMIN",
        message: `Reservation cancelled by the platform administrator: ${reservation.product_name}`,
        reservationId,
        productId: reservation.product_id,
        details: reason,
      });
    }
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "CANCEL_RESERVATION",
      targetUserId: reservation.restaurant_id,
      targetProductId: reservation.product_id,
      targetReservationId: reservationId,
      reason,
    });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Rezervacija je otkazana." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom otkazivanja rezervacije:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom otkazivanja rezervacije." });
  } finally {
    if (client) client.release();
  }
};

// The admin corrects a user's name and business data (the logo stays the user's own).
export const updateUserProfile = async (req: Request, res: Response) => {
  const targetId = parseId(req.params.id);
  if (targetId === null) {
    return res.status(404).json({ error: "Korisnik nije pronađen." });
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
      return res.status(404).json({ error: "Korisnik nije pronađen." });
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
    return res.status(200).json({ message: "Profil korisnika je ažuriran.", user: user.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom uređivanja profila korisnika:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom uređivanja profila." });
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
    return { error: "Publika nije ispravna." };
  }
  if (!fields.title_bs || !fields.body_bs) {
    return { error: "Naslov i tekst su obavezni." };
  }
  if (Boolean(fields.title_en) !== Boolean(fields.body_en)) {
    return { error: "Za engleski prevod unesite i naslov i tekst." };
  }
  if (fields.title_bs.length > MAX_ANNOUNCEMENT_TITLE || fields.title_en.length > MAX_ANNOUNCEMENT_TITLE) {
    return { error: `Naslov može imati najviše ${MAX_ANNOUNCEMENT_TITLE} znakova.` };
  }
  if (fields.body_bs.length > MAX_ANNOUNCEMENT_BODY || fields.body_en.length > MAX_ANNOUNCEMENT_BODY) {
    return { error: `Tekst može imati najviše ${MAX_ANNOUNCEMENT_BODY} znakova.` };
  }
  let expiresAt: string | null = null;
  if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== "") {
    if (!isValidDateTime(body.expires_at) || new Date(body.expires_at as string).getTime() <= Date.now()) {
      return { error: "Datum isteka mora biti u budućnosti." };
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
  const roles = fields.audience === "ALL" ? ["STORE", "RESTAURANT"] : [fields.audience];

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
    const sent = await client.query(
      `INSERT INTO notifications (user_id, type, message, announcement_id)
       SELECT users.id, $1, $2, $3
       FROM users
       WHERE users.is_blocked = false AND users.role::text = ANY($4)`,
      [
        "PLATFORM_ANNOUNCEMENT",
        `Platform announcement: ${fields.title_en || fields.title_bs}`,
        announcement.id,
        roles,
      ],
    );
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "CREATE_ANNOUNCEMENT",
      targetAnnouncementId: announcement.id,
    });
    await client.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Obavještenje je poslano.", announcement, recipients: sent.rowCount ?? 0 });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom slanja obavještenja:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom slanja obavještenja." });
  } finally {
    if (client) client.release();
  }
};

export const getAnnouncements = async (req: Request, res: Response) => {
  const page = parsePage(req.query);
  if (!page) {
    return res.status(400).json({ error: "Neispravan filter." });
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
    console.error("Greška prilikom dohvatanja obavještenja:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom dohvatanja obavještenja." });
  }
};

export const endAnnouncement = async (req: Request, res: Response) => {
  const announcementId = parseId(req.params.id);
  if (announcementId === null) {
    return res.status(404).json({ error: "Obavještenje nije pronađeno." });
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
      return res.status(404).json({ error: "Obavještenje nije pronađeno." });
    }
    if (!existing.rows[0].is_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Obavještenje je već završeno." });
    }
    await client.query("UPDATE announcements SET ended_at = NOW() WHERE announcements.id = $1", [announcementId]);
    await logAdminAction(client, {
      adminId: req.user!.id,
      action: "END_ANNOUNCEMENT",
      targetAnnouncementId: announcementId,
    });
    await client.query("COMMIT");
    return res.status(200).json({ message: "Obavještenje je završeno." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom završavanja obavještenja:", error);
    return res.status(500).json({ error: "Došlo je do greške prilikom završavanja obavještenja." });
  } finally {
    if (client) client.release();
  }
};
