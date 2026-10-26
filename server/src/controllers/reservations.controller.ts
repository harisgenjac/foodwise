import pool from "../config/db.js";
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { createNotification } from "../utils/notifications.js";
import { isValidDateTime } from "../utils/dates.js";
import { parseId, parseNumber } from "../utils/params.js";
import { CARD_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import { HttpError } from "../utils/httpError.js";
import { chargeForReservation, refundForReservation } from "../services/creditService.js";

export const RESERVATION_STATUSES = ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"];

export const createReservation = async (req: Request, res: Response) => {
  const { product_id, quantity, pickup_date } = req.body ?? {};
  const restaurant_id = req.user!.id;

  if (!product_id || quantity === undefined || quantity === null || quantity === "" || !pickup_date) {
    return res.status(400).json({ error: "All fields are required." });
  }
  const productId = parseId(product_id);
  if (productId === null) {
    return res.status(404).json({ error: "Product not found." });
  }
  const requestedQuantity = parseNumber(quantity);
  if (requestedQuantity === null || requestedQuantity <= 0) {
    return res.status(400).json({ error: "Quantity must be greater than zero." });
  }
  if (!isValidDateTime(pickup_date)) {
    return res.status(400).json({ error: "Pickup date is not valid." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const products = await client.query(
      `SELECT *,
         expiry_date < CURRENT_DATE AS is_expired,
         $2::timestamp::date < CURRENT_DATE OR $2::timestamp::date > expiry_date AS pickup_out_of_range
       FROM products
       WHERE id = $1
         AND store_id NOT IN (SELECT users.id FROM users WHERE users.is_blocked)
       FOR UPDATE`,
      [productId, pickup_date],
    );
    if (products.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found." });
    }
    if (products.rows[0].status !== "Available" || products.rows[0].is_expired) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Product is no longer available for reservation." });
    }
    if (products.rows[0].pickup_out_of_range) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Pickup date must be between today and the product's expiry date.",
      });
    }
    const reserved = await client.query(
      "SELECT COALESCE(SUM(quantity), 0) AS total_reserved FROM reservations WHERE product_id = $1 AND status IN ('Pending', 'Confirmed', 'Completed')",
      [productId],
    );
    const availableQuantity =
      parseFloat(products.rows[0].quantity) -
      parseFloat(reserved.rows[0].total_reserved);
    if (availableQuantity < requestedQuantity) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Not enough product available." });
    }

    // unit_price keeps the price agreed at reservation time, even if the store edits the product later.
    const result = await client.query(
      "INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date) VALUES ($1, $2, $3, $4, 'Pending', $5) RETURNING *",
      [productId, restaurant_id, requestedQuantity, products.rows[0].discounted_price, pickup_date],
    );
    // 1 credit per reservation, in the same transaction: without credits the reservation is
    // rolled back (402). The product lock is already held, the subscription lock comes second.
    await chargeForReservation(client, restaurant_id, {
      id: result.rows[0].id,
      category: products.rows[0].category,
    });
    await createNotification(client, {
      userId: products.rows[0].store_id,
      type: "RESERVATION_CREATED",
      message: `New reservation request: ${requestedQuantity}${products.rows[0].unit} ${products.rows[0].name}`,
      reservationId: result.rows[0].id,
      productId: products.rows[0].id,
    });
    await client.query("COMMIT");
    return res.status(201).json({
      message: "Reservation created successfully.",
      reservation: result.rows[0],
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error instanceof HttpError) {
      return res.status(error.status).json(error.body());
    }
    console.error("Error while creating reservation:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while creating the reservation." });
  } finally {
    if (client) client.release();
  }
};

export const getReservationById = async (req: Request, res: Response) => {
  try {
    const reservationId = parseId(req.params.id);
    const restorantId = req.user!.id;

    if (reservationId === null) {
      return res
        .status(404)
        .json({ error: "No reservation exists with that ID" });
    }

    const result = await pool.query(
      `SELECT
    reservations.id,
    reservations.product_id,
    reservations.restaurant_id,
    reservations.quantity,
    reservations.status,
    reservations.pickup_date,
    reservations.picked_up_at,
    reservations.created_at,
    reservations.updated_at,
    reservations.status = 'Confirmed' AND reservations.pickup_date::date < CURRENT_DATE AS is_overdue,
    products.name AS product_name,
    products.description,
    reservations.unit_price AS discounted_price,
    products.original_price,
    products.category,
    products.unit,
    products.store_id,
    stores.business_name,
    stores.city,
    stores.address AS store_address,
    stores.phone AS store_phone,
    stores.pickup_hours AS store_pickup_hours,
    restaurants.business_name AS restaurant_name,
    restaurants.city AS restaurant_city,
    restaurants.address AS restaurant_address,
    restaurants.phone AS restaurant_phone
    FROM reservations
    JOIN products ON reservations.product_id = products.id
    JOIN users AS stores ON products.store_id = stores.id
    JOIN users AS restaurants ON reservations.restaurant_id = restaurants.id
    WHERE reservations.id = $1
    AND (reservations.restaurant_id = $2 OR products.store_id = $2)`,
      [reservationId, restorantId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No reservation exists with that ID" });
    }
    return res.status(200).json({
      message: "Reservation fetched successfully",
      reservation: result.rows[0],
    });
  } catch (error) {
    console.error("Error while fetching reservation:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching reservations." });
  }
};

// "Reserved" periods of the restaurant's reservations, by created_at. created_at is a timestamp
// written in the session time zone (APP_TIMEZONE), so CURRENT_DATE is the local midnight.
const MINE_PERIODS: Record<string, string> = {
  today: "reservations.created_at >= CURRENT_DATE",
  "7d": "reservations.created_at >= CURRENT_DATE - 6",
  month: "reservations.created_at >= date_trunc('month', CURRENT_DATE)",
};

const STATUS_ORDER = `CASE
        WHEN reservations.status = 'Pending' THEN 0
        WHEN reservations.status = 'Confirmed' THEN 1
        WHEN reservations.status = 'Completed' THEN 2
        WHEN reservations.status = 'Rejected' THEN 3
        WHEN reservations.status = 'Cancelled' THEN 4
      END`;

const MINE_SORTS: Record<string, string> = {
  newest: "reservations.created_at DESC, reservations.id DESC",
  status: `${STATUS_ORDER}, reservations.created_at DESC, reservations.id DESC`,
  pickup: "reservations.pickup_date ASC, reservations.id DESC",
};

// An empty value means "not set", as the client sends unused parameters.
const optionalParam = (value: unknown, allowed: Record<string, string>): string | null | undefined => {
  if (value === undefined || value === "") return undefined;
  return typeof value === "string" && Object.hasOwn(allowed, value) ? allowed[value]! : null;
};

// FROM/WHERE shared by GET /reservations/mine and /mine/summary: the restaurant's own
// reservations with the name, store and period filters (and status for the list). Null for an
// invalid filter, which the caller answers with 400 "Invalid filter.".
const mineFilters = (query: Request["query"], restaurantId: number, includeStatus: boolean) => {
  const { status, name, business_name, store_id } = query;
  let from = `FROM reservations
  JOIN products ON reservations.product_id = products.id
  JOIN users ON products.store_id = users.id
  WHERE reservations.restaurant_id = $1`;
  const values: (string | number)[] = [restaurantId];

  if (includeStatus && status) {
    if (!RESERVATION_STATUSES.includes(status as string)) return null;
    values.push(status as string);
    from += ` AND reservations.status = $${values.length}`;
  }
  if (name) {
    values.push(`%${name}%` as string);
    from += ` AND products.name ILIKE $${values.length}`;
  }
  if (business_name) {
    values.push(`%${business_name}%` as string);
    from += ` AND users.business_name ILIKE $${values.length}`;
  }
  if (store_id) {
    const storeId = parseId(store_id);
    if (storeId === null) return null;
    values.push(storeId);
    from += ` AND products.store_id = $${values.length}`;
  }
  const period = optionalParam(query.period, MINE_PERIODS);
  if (period === null) return null;
  if (period) from += ` AND ${period}`;
  return { from, values };
};

export const getMineReservations = async (req: Request, res: Response) => {
  const restaurant_id = req.user!.id;
  const page = parsePage(req.query, CARD_PAGE_SIZE);
  const filters = mineFilters(req.query, restaurant_id, true);
  const scope = optionalParam(req.query.scope, { active: "active", all: "all" });
  const sort = optionalParam(req.query.sort, MINE_SORTS);
  if (!page || !filters || scope === null || sort === null) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    const columns = `
    reservations.id,
    reservations.restaurant_id,
    reservations.quantity,
    reservations.status,
    reservations.pickup_date,
    reservations.created_at,
    reservations.updated_at,
    products.name AS product_name,
    products.description,
    reservations.unit_price AS discounted_price,
    products.original_price,
    products.category,
    products.unit,
    users.business_name,
    users.city`;
    let { from } = filters;
    // "active" is what still needs the restaurant's attention; without a scope, all statuses.
    if (scope === "active") {
      from += ` AND reservations.status IN ('Pending', 'Confirmed')`;
    }

    // Without a sort, the status order (the dashboard and the store profile rely on it).
    const { rows, total } = await listPage(columns, from, sort ?? MINE_SORTS.status!, filters.values, page);
    return res.status(200).json({
      message: "Reservations fetched successfully.",
      reservations: rows,
      total,
    });
  } catch (error) {
    console.error("Error while fetching reservations:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching reservations." });
  }
};

// Counts per status for the same filters as the list, except scope and status: the summary
// line and the tab counts on My reservations.
export const getMineReservationsSummary = async (req: Request, res: Response) => {
  const filters = mineFilters(req.query, req.user!.id, false);
  if (!filters) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE reservations.status = 'Pending') AS pending,
         COUNT(*) FILTER (WHERE reservations.status = 'Confirmed') AS confirmed,
         COUNT(*) FILTER (WHERE reservations.status = 'Completed') AS completed,
         COUNT(*) FILTER (WHERE reservations.status = 'Rejected') AS rejected,
         COUNT(*) FILTER (WHERE reservations.status = 'Cancelled') AS cancelled
       ${filters.from}`,
      filters.values,
    );
    const row = result.rows[0];
    const counts = {
      Pending: parseInt(row.pending, 10),
      Confirmed: parseInt(row.confirmed, 10),
      Completed: parseInt(row.completed, 10),
      Rejected: parseInt(row.rejected, 10),
      Cancelled: parseInt(row.cancelled, 10),
    };
    return res.status(200).json({
      message: "Reservations fetched successfully.",
      summary: {
        total: parseInt(row.total, 10),
        active: counts.Pending + counts.Confirmed,
        counts,
      },
    });
  } catch (error) {
    console.error("Error while fetching reservations:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching reservations." });
  }
};

export const getStoreReservations = async (req: Request, res: Response) => {
  const store_id = req.user!.id;
  const { status, name, city } = req.query;
  const page = parsePage(req.query, CARD_PAGE_SIZE);
  if (!page) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  try {
    const columns = `
        reservations.id,
        reservations.restaurant_id,
        reservations.quantity,
        reservations.status,
        reservations.pickup_date,
        reservations.picked_up_at,
        reservations.created_at,
        reservations.updated_at,
        reservations.status = 'Confirmed' AND reservations.pickup_date::date < CURRENT_DATE AS is_overdue,
        products.name AS product_name,
        products.description,
        reservations.unit_price AS discounted_price,
        products.original_price,
        products.category,
        products.unit,
        users.business_name,
        users.city`;
    let query = `FROM reservations
      JOIN products ON reservations.product_id = products.id
      JOIN users ON reservations.restaurant_id = users.id
      WHERE products.store_id = $1`;
    let values: (string | number)[] = [store_id];

    if (status) {
      if (!RESERVATION_STATUSES.includes(status as string)) {
        return res.status(400).json({ error: "Invalid filter." });
      }
      values.push(status as string);
      query += ` AND reservations.status = $${values.length}`;
    }
    if (name) {
      values.push(`%${name}%` as string);
      query += ` AND products.name ILIKE $${values.length}`;
    }
    if (city) {
      values.push(`%${city}%` as string);
      query += ` AND users.city ILIKE $${values.length}`;
    }

    const { rows, total } = await listPage(
      columns,
      query,
      `CASE WHEN reservations.status = 'Pending' THEN 0 ELSE 1 END,
      reservations.created_at DESC, reservations.id DESC`,
      values,
      page,
    );

    return res.status(200).json({
      message: "Reservations fetched successfully.",
      reservations: rows,
      total,
    });
  } catch (error) {
    console.error("Error while fetching reservations:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching reservations." });
  }
};

// Marks the product Sold once confirmed (or already picked up) reservations cover its whole quantity.
// The caller's transaction must hold the lock on the product row.
export const markSoldIfFullyConfirmed = async (
  client: PoolClient,
  product: { id: number; store_id: number; name: string; quantity: string },
) => {
  const confirmedSum = await client.query(
    "SELECT COALESCE(SUM(quantity), 0) AS total_confirmed FROM reservations WHERE product_id = $1 AND status IN ('Confirmed', 'Completed')",
    [product.id],
  );
  if (parseFloat(confirmedSum.rows[0].total_confirmed) < parseFloat(product.quantity)) {
    return false;
  }
  await client.query("UPDATE products SET status = 'Sold' WHERE id = $1", [product.id]);
  await createNotification(client, {
    userId: product.store_id,
    type: "PRODUCT_SOLD_OUT",
    message: `${product.name} is sold out.`,
    productId: product.id,
  });
  return true;
};

export const acceptReservation = async (req: Request, res: Response) => {
  const reservationId = parseId(req.params.id);
  const store_id = req.user!.id;

  if (reservationId === null) {
    return res.status(404).json({ error: "Reservation not found." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT * FROM reservations WHERE id = $1 FOR UPDATE",
      [reservationId],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Reservation not found." });
    }

    const productResult = await client.query(
      "SELECT *, expiry_date < CURRENT_DATE AS is_expired FROM products WHERE id = $1 FOR UPDATE",
      [result.rows[0].product_id],
    );

    if (productResult.rows[0].store_id !== store_id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "You are not allowed to accept this reservation." });
    }

    if (result.rows[0].status !== "Pending") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Reservation is not in 'Pending' status." });
    }

    if (productResult.rows[0].is_expired) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error:
          "The reservation cannot be accepted because the product has expired.",
      });
    }

    await client.query(
      "UPDATE reservations SET status = 'Confirmed' WHERE id = $1",
      [reservationId],
    );
    await createNotification(client, {
      userId: result.rows[0].restaurant_id,
      type: "RESERVATION_ACCEPTED",
      message: `Your reservation for ${productResult.rows[0].name} was accepted.`,
      reservationId: result.rows[0].id,
      productId: result.rows[0].product_id,
    });

    await markSoldIfFullyConfirmed(client, productResult.rows[0]);

    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Reservation accepted successfully." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while accepting reservation:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while accepting the reservation." });
  } finally {
    if (client) client.release();
  }
};

// Locks the reservation row, so a reject, cancel or pickup cannot interleave with another status change.
// A pickup is overdue once its whole day has passed (the pickup time on the same day does not count).
export const lockReservation = (client: PoolClient, reservationId: number) =>
  client.query(
    `SELECT
       reservations.id,
       reservations.status,
       reservations.restaurant_id,
       reservations.product_id,
       reservations.pickup_date::date < CURRENT_DATE AS is_overdue,
       products.name AS product_name,
       products.store_id
     FROM reservations
     JOIN products ON reservations.product_id = products.id
     WHERE reservations.id = $1
     FOR UPDATE OF reservations`,
    [reservationId],
  );

export const rejectReservation = async (req: Request, res: Response) => {
  const reservationId = parseId(req.params.id);
  const store_id = req.user!.id;
  if (reservationId === null) {
    return res.status(404).json({ error: "Reservation not found." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await lockReservation(client, reservationId);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Reservation not found." });
    }

    if (result.rows[0].store_id !== store_id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "You are not allowed to reject this reservation." });
    }

    if (result.rows[0].status !== "Pending") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Reservation is not in 'Pending' status." });
    }
    await client.query(
      "UPDATE reservations SET status = 'Rejected' WHERE id = $1 AND status = 'Pending'",
      [reservationId],
    );
    // The store said no, so the restaurant is not at fault: always refunded, on any day.
    await refundForReservation(client, reservationId, {
      forced: true,
      by: { actor: "USER", userId: store_id },
    });
    await createNotification(client, {
      userId: result.rows[0].restaurant_id,
      type: "RESERVATION_REJECTED",
      message: `Your reservation for ${result.rows[0].product_name} was rejected.`,
      reservationId: result.rows[0].id,
      productId: result.rows[0].product_id,
    });
    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Reservation rejected successfully." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while rejecting reservation:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while rejecting the reservation." });
  } finally {
    if (client) client.release();
  }
};

export const cancelReservation = async (req: Request, res: Response) => {
  const reservationId = parseId(req.params.id);
  const restaurant_id = req.user!.id;
  if (reservationId === null) {
    return res.status(404).json({ error: "Reservation not found." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await lockReservation(client, reservationId);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Reservation not found." });
    }

    if (result.rows[0].restaurant_id !== restaurant_id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "You are not allowed to cancel this reservation." });
    }

    if (result.rows[0].status !== "Pending") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Reservation is not in 'Pending' status." });
    }

    await client.query(
      "UPDATE reservations SET status = 'Cancelled' WHERE id = $1 AND status = 'Pending'",
      [reservationId],
    );
    // The restaurant's own decision: refunded only on the credit day of the charge.
    const refund = await refundForReservation(client, reservationId, {
      forced: false,
      by: { actor: "USER", userId: restaurant_id },
    });
    await createNotification(client, {
      userId: result.rows[0].store_id,
      type: "RESERVATION_CANCELLED",
      message: `A reservation for ${result.rows[0].product_name} was cancelled.`,
      reservationId: result.rows[0].id,
      productId: result.rows[0].product_id,
    });
    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Reservation cancelled successfully.", creditRefunded: refund.refunded });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while cancelling reservation:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while cancelling the reservation." });
  } finally {
    if (client) client.release();
  }
};

export const PICKUP_SCOPES = ["today", "upcoming", "completed"];

// Rows of the pickups page belong to the caller through the product (store) or the reservation (restaurant);
// `parties` is the other side of the handover.
export const pickupOwnership = (role: string) =>
  role === "STORE"
    ? { owner: "products.store_id = $1", partyJoin: "reservations.restaurant_id = parties.id" }
    : { owner: "reservations.restaurant_id = $1", partyJoin: "products.store_id = parties.id" };

export const getPickups = async (req: Request, res: Response) => {
  const { id: userId, role } = req.user!;
  const { scope, name } = req.query;

  if (!PICKUP_SCOPES.includes(scope as string)) {
    return res.status(400).json({ error: "Invalid filter." });
  }
  // Only the picked-up history is paged: an open (or late) pickup must never hide on a later page.
  const page = scope === "completed" ? parsePage(req.query, CARD_PAGE_SIZE) : null;
  if (scope === "completed" && !page) {
    return res.status(400).json({ error: "Invalid filter." });
  }

  try {
    const { owner, partyJoin } = pickupOwnership(role);
    const columns = `
        reservations.id,
        reservations.product_id,
        reservations.restaurant_id,
        reservations.quantity,
        reservations.status,
        reservations.pickup_date,
        reservations.picked_up_at,
        reservations.created_at,
        reservations.updated_at,
        reservations.status = 'Confirmed' AND reservations.pickup_date::date < CURRENT_DATE AS is_overdue,
        GREATEST(CURRENT_DATE - reservations.pickup_date::date, 0) AS days_overdue,
        products.name AS product_name,
        products.description,
        reservations.unit_price AS discounted_price,
        products.original_price,
        products.category,
        products.unit,
        products.store_id,
        parties.business_name,
        parties.city,
        parties.phone AS party_phone,
        parties.address AS party_address,
        parties.pickup_hours AS party_pickup_hours`;
    let query = `FROM reservations
      JOIN products ON reservations.product_id = products.id
      JOIN users AS parties ON ${partyJoin}
      WHERE ${owner}`;
    const values: (string | number)[] = [userId];

    if (scope === "today") {
      query += ` AND reservations.status = 'Confirmed' AND reservations.pickup_date::date <= CURRENT_DATE`;
    } else if (scope === "upcoming") {
      query += ` AND reservations.status = 'Confirmed' AND reservations.pickup_date::date > CURRENT_DATE`;
    } else {
      query += ` AND reservations.status = 'Completed'`;
    }
    if (name) {
      values.push(`%${name}%` as string);
      query += ` AND products.name ILIKE $${values.length}`;
    }

    // Handed-over ones newest first, in pages.
    if (page) {
      const { rows, total } = await listPage(
        columns,
        query,
        "reservations.picked_up_at DESC NULLS LAST, reservations.pickup_date DESC, reservations.id DESC",
        values,
        page,
      );
      return res.status(200).json({
        message: "Pickups fetched successfully.",
        reservations: rows,
        total,
      });
    }

    // Open pickups by time (missed ones from earlier days come first), all of them.
    const result = await pool.query(
      `SELECT ${columns} ${query} ORDER BY reservations.pickup_date ASC, reservations.id ASC`,
      values,
    );
    return res.status(200).json({
      message: "Pickups fetched successfully.",
      reservations: result.rows,
    });
  } catch (error) {
    console.error("Error while fetching pickups:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching pickups." });
  }
};

export const getPickupCounts = async (req: Request, res: Response) => {
  const { id: userId, role } = req.user!;
  try {
    const { owner } = pickupOwnership(role);
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE reservations.status = 'Confirmed' AND reservations.pickup_date::date <= CURRENT_DATE) AS today,
         COUNT(*) FILTER (WHERE reservations.status = 'Confirmed' AND reservations.pickup_date::date < CURRENT_DATE) AS overdue,
         COUNT(*) FILTER (WHERE reservations.status = 'Confirmed' AND reservations.pickup_date::date > CURRENT_DATE) AS upcoming,
         COUNT(*) FILTER (WHERE reservations.status = 'Completed') AS completed
       FROM reservations
       JOIN products ON reservations.product_id = products.id
       WHERE ${owner}`,
      [userId],
    );
    const row = result.rows[0];
    return res.status(200).json({
      message: "Pickups fetched successfully.",
      counts: {
        today: parseInt(row.today, 10),
        overdue: parseInt(row.overdue, 10),
        upcoming: parseInt(row.upcoming, 10),
        completed: parseInt(row.completed, 10),
      },
    });
  } catch (error) {
    console.error("Error while fetching pickups:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching pickups." });
  }
};

// The store hands the food over. Allowed after the pickup time or the product's expiry too:
// the food was already promised to this restaurant.
export const completeReservation = async (req: Request, res: Response) => {
  const reservationId = parseId(req.params.id);
  const store_id = req.user!.id;
  if (reservationId === null) {
    return res.status(404).json({ error: "Reservation not found." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await lockReservation(client, reservationId);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Reservation not found." });
    }

    if (result.rows[0].store_id !== store_id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "You are not allowed to confirm the pickup of this reservation." });
    }

    if (result.rows[0].status !== "Confirmed") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Only accepted reservations can be marked as picked up.",
      });
    }

    await client.query(
      "UPDATE reservations SET status = 'Completed', picked_up_at = NOW() WHERE id = $1 AND status = 'Confirmed'",
      [reservationId],
    );
    await createNotification(client, {
      userId: result.rows[0].restaurant_id,
      type: "RESERVATION_COMPLETED",
      message: `Pickup of ${result.rows[0].product_name} confirmed.`,
      reservationId: result.rows[0].id,
      productId: result.rows[0].product_id,
    });
    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Reservation marked as picked up." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while confirming pickup:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while confirming the pickup." });
  } finally {
    if (client) client.release();
  }
};

// After a Confirmed reservation was cancelled: a product it had sold out becomes Available again,
// unless it has expired or Confirmed + Completed still cover its quantity. Locks the product row.
export const releaseSoldProduct = async (client: PoolClient, productId: number) => {
  const productResult = await client.query(
    "SELECT id, status, quantity, expiry_date < CURRENT_DATE AS is_expired FROM products WHERE id = $1 FOR UPDATE",
    [productId],
  );
  const product = productResult.rows[0];
  if (!product || product.status !== "Sold" || product.is_expired) return;
  const held = await client.query(
    "SELECT COALESCE(SUM(quantity), 0) AS total_held FROM reservations WHERE product_id = $1 AND status IN ('Confirmed', 'Completed')",
    [product.id],
  );
  if (parseFloat(held.rows[0].total_held) < parseFloat(product.quantity)) {
    await client.query("UPDATE products SET status = 'Available' WHERE id = $1", [product.id]);
  }
};

// The restaurant did not come: the store cancels a Confirmed reservation whose pickup day has passed.
// The quantity goes back on offer, and a product sold out by it becomes Available again while it has not expired.
export const cancelOverdueReservation = async (req: Request, res: Response) => {
  const reservationId = parseId(req.params.id);
  const store_id = req.user!.id;
  if (reservationId === null) {
    return res.status(404).json({ error: "Reservation not found." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await lockReservation(client, reservationId);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Reservation not found." });
    }

    if (result.rows[0].store_id !== store_id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "You are not allowed to cancel this reservation." });
    }

    if (result.rows[0].status !== "Confirmed" || !result.rows[0].is_overdue) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Only overdue pickups can be cancelled." });
    }

    await client.query(
      "UPDATE reservations SET status = 'Cancelled' WHERE id = $1 AND status = 'Confirmed'",
      [reservationId],
    );
    await releaseSoldProduct(client, result.rows[0].product_id);
    // No credit refund here: the restaurant missed its own pickup.

    await createNotification(client, {
      userId: result.rows[0].restaurant_id,
      type: "PICKUP_MISSED",
      message: `Your reservation for ${result.rows[0].product_name} was cancelled because it was not picked up.`,
      reservationId: result.rows[0].id,
      productId: result.rows[0].product_id,
    });
    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Overdue reservation cancelled." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while cancelling overdue reservation:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while cancelling the reservation." });
  } finally {
    if (client) client.release();
  }
};
