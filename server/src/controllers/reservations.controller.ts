import pool from "../config/db.js";
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { isValidDateTime } from "../utils/dates.js";
import { HttpError } from "../utils/httpError.js";
import { parseId, parseNumber } from "../utils/params.js";
import { CARD_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import { parseCityFilter } from "../utils/cities.js";
import { visibleStore } from "../utils/visibility.js";
import { freeQuantity } from "../services/stock.js";
import { sendOrder } from "../services/orders/send.js";
import { decideOrder } from "../services/orders/decision.js";
import { cancelOrder, cancelOverdueOrder, completeOrder } from "../services/orders/actions.js";
import { inTransaction } from "../utils/transaction.js";

// TEMPORARY (orders PR 3a): today's reservation screens keep working on one-item orders until
// PR 3b moves them to /api/orders and removes these endpoints. The lists, details and pickups
// below read the items (one row per item, as before); every write goes through the order service:
// reserving sends a one-item order, accept / reject / cancel / complete / cancel-overdue act on
// the item's order. The checks before the service keep the old answers; the service checks
// everything again under its locks.

export const RESERVATION_STATUSES = ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"];

const NOT_FOUND = "Reservation not found.";

// The answer for an error the order service threw (or 500 with `message`).
const failWith = (res: Response, error: unknown, log: string, message: string) => {
  if (error instanceof HttpError) return res.status(error.status).json(error.body());
  console.error(log, error);
  return res.status(500).json({ error: message });
};

// Sends a one-item order. The restaurant saw today's price, and the old dialog never sends less
// than asked, so partial fulfilment is off: anything short of the full quantity is refused.
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

  try {
    const products = await pool.query(
      `SELECT products.id, products.status, products.discounted_price,
         products.expiry_date < CURRENT_DATE AS is_expired,
         $2::timestamp::date < CURRENT_DATE OR $2::timestamp::date > products.expiry_date AS pickup_out_of_range
       FROM products
       WHERE products.id = $1
         AND products.store_id IN (SELECT users.id FROM users WHERE ${visibleStore("users")})`,
      [productId, pickup_date],
    );
    const product = products.rows[0];
    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }
    if (product.status !== "Available" || product.is_expired) {
      return res.status(400).json({ error: "Product is no longer available for reservation." });
    }
    if (product.pickup_out_of_range) {
      return res.status(400).json({
        error: "Pickup date must be between today and the product's expiry date.",
      });
    }
    if ((await freeQuantity(pool, productId)) < requestedQuantity) {
      return res.status(400).json({ error: "Not enough product available." });
    }

    const sent = await inTransaction((client) =>
      sendOrder(client, restaurant_id, {
        pickupAt: pickup_date,
        acceptPartial: false,
        lines: [{ productId, quantity: requestedQuantity, unitPrice: parseFloat(product.discounted_price) }],
      }),
    );
    const reservation = await pool.query("SELECT * FROM reservations WHERE reservations.id = $1", [
      sent.items[0]!.id,
    ]);
    return res.status(201).json({
      message: "Reservation created successfully.",
      reservation: reservation.rows[0],
    });
  } catch (error) {
    // Something changed between the checks above and the service's locks.
    if (error instanceof HttpError && error.details.code === "ORDER_NOT_SENT") {
      const [line] = error.details.lines as { kind: string }[];
      return res.status(400).json({
        error:
          line?.kind === "QUANTITY_REDUCED"
            ? "Not enough product available."
            : "Product is no longer available for reservation.",
      });
    }
    return failWith(res, error, "Error while creating reservation:", "An error occurred while creating the reservation.");
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
    store_cities.name AS city,
    stores.address AS store_address,
    stores.phone AS store_phone,
    stores.pickup_hours AS store_pickup_hours,
    restaurants.business_name AS restaurant_name,
    restaurant_cities.name AS restaurant_city,
    restaurants.address AS restaurant_address,
    restaurants.phone AS restaurant_phone
    FROM reservations
    JOIN products ON reservations.product_id = products.id
    JOIN users AS stores ON products.store_id = stores.id
    JOIN users AS restaurants ON reservations.restaurant_id = restaurants.id
    LEFT JOIN cities AS store_cities ON store_cities.id = stores.city_id
    LEFT JOIN cities AS restaurant_cities ON restaurant_cities.id = restaurants.city_id
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
  LEFT JOIN cities ON cities.id = users.city_id
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
    products.store_id,
    users.business_name,
    cities.name AS city`;
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

// The reservations on a store's products (GET /reservations/store), also shown read-only to its
// company's headquarters (GET /company/branches/:id/reservations). Null for an invalid filter or page.
export const listStoreReservations = async (storeId: number, query: Request["query"]) => {
  const { status, name, city_id } = query;
  const page = parsePage(query, CARD_PAGE_SIZE);
  if (!page) {
    return null;
  }
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
      cities.name AS city`;
  let from = `FROM reservations
    JOIN products ON reservations.product_id = products.id
    JOIN users ON reservations.restaurant_id = users.id
    LEFT JOIN cities ON cities.id = users.city_id
    WHERE products.store_id = $1`;
  const values: (string | number)[] = [storeId];

  if (status) {
    if (!RESERVATION_STATUSES.includes(status as string)) {
      return null;
    }
    values.push(status as string);
    from += ` AND reservations.status = $${values.length}`;
  }
  if (name) {
    values.push(`%${name}%` as string);
    from += ` AND products.name ILIKE $${values.length}`;
  }
  // The restaurant's city.
  const cityFilter = await parseCityFilter(pool, city_id);
  if ("invalid" in cityFilter) {
    return null;
  }
  if (cityFilter.cityId !== null) {
    values.push(cityFilter.cityId);
    from += ` AND users.city_id = $${values.length}`;
  }

  const { rows, total } = await listPage(
    columns,
    from,
    `CASE WHEN reservations.status = 'Pending' THEN 0 ELSE 1 END,
    reservations.created_at DESC, reservations.id DESC`,
    values,
    page,
  );
  return { reservations: rows, total };
};

export const getStoreReservations = async (req: Request, res: Response) => {
  try {
    const result = await listStoreReservations(req.user!.id, req.query);
    if (!result) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    return res.status(200).json({ message: "Reservations fetched successfully.", ...result });
  } catch (error) {
    console.error("Error while fetching reservations:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching reservations." });
  }
};

// The item with what the old answers need (no lock: the order service locks and checks again).
// A pickup is overdue once its whole day has passed (the pickup time on the same day does not count).
export const findReservation = async (db: Pick<PoolClient, "query">, reservationId: number) => {
  const result = await db.query(
    `SELECT
       reservations.id,
       reservations.order_id,
       reservations.status,
       reservations.restaurant_id,
       reservations.product_id,
       reservations.pickup_date::date < CURRENT_DATE AS is_overdue,
       products.name AS product_name,
       products.store_id,
       products.expiry_date < CURRENT_DATE AS is_expired
     FROM reservations
     JOIN products ON reservations.product_id = products.id
     WHERE reservations.id = $1`,
    [reservationId],
  );
  return result.rows[0] ?? null;
};

type Reservation = NonNullable<Awaited<ReturnType<typeof findReservation>>>;

// One write on the reservation's order: the old checks (`check` returns an error answer or null),
// then the order service in a transaction.
const reservationAction =
  (
    party: "store_id" | "restaurant_id",
    forbidden: string,
    check: (reservation: Reservation) => { status: number; error: string } | null,
    run: (client: PoolClient, userId: number, reservation: Reservation) => Promise<unknown>,
    message: string,
    log: string,
    errorMessage: string,
  ) =>
  async (req: Request, res: Response) => {
    const reservationId = parseId(req.params.id);
    if (reservationId === null) {
      return res.status(404).json({ error: NOT_FOUND });
    }
    try {
      const reservation = await findReservation(pool, reservationId);
      if (!reservation) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      if (reservation[party] !== req.user!.id) {
        return res.status(403).json({ error: forbidden });
      }
      const refused = check(reservation);
      if (refused) {
        return res.status(refused.status).json({ error: refused.error });
      }
      await inTransaction((client) => run(client, req.user!.id, reservation));
      return res.status(200).json({ message });
    } catch (error) {
      return failWith(res, error, log, errorMessage);
    }
  };

const NOT_PENDING = { status: 400, error: "Reservation is not in 'Pending' status." };

export const acceptReservation = reservationAction(
  "store_id",
  "You are not allowed to accept this reservation.",
  (reservation) =>
    reservation.status !== "Pending"
      ? NOT_PENDING
      : reservation.is_expired
        ? { status: 400, error: "The reservation cannot be accepted because the product has expired." }
        : null,
  (client, storeId, reservation) =>
    decideOrder(client, storeId, reservation.order_id, { items: [{ item_id: reservation.id, action: "ACCEPT" }] }),
  "Reservation accepted successfully.",
  "Error while accepting reservation:",
  "An error occurred while accepting the reservation.",
);

// Rejects the item's (one-item) order. The old dialog has no reason, so this is the one
// rejection without one.
export const rejectReservation = reservationAction(
  "store_id",
  "You are not allowed to reject this reservation.",
  (reservation) => (reservation.status !== "Pending" ? NOT_PENDING : null),
  (client, storeId, reservation) =>
    decideOrder(client, storeId, reservation.order_id, { reject_order: true }, { reasonRequired: false }),
  "Reservation rejected successfully.",
  "Error while rejecting reservation:",
  "An error occurred while rejecting the reservation.",
);

export const cancelReservation = reservationAction(
  "restaurant_id",
  "You are not allowed to cancel this reservation.",
  (reservation) => (reservation.status !== "Pending" ? NOT_PENDING : null),
  (client, restaurantId, reservation) => cancelOrder(client, restaurantId, reservation.order_id),
  "Reservation cancelled successfully.",
  "Error while cancelling reservation:",
  "An error occurred while cancelling the reservation.",
);

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
        cities.name AS city,
        parties.phone AS party_phone,
        parties.address AS party_address,
        parties.pickup_hours AS party_pickup_hours`;
    let query = `FROM reservations
      JOIN products ON reservations.product_id = products.id
      JOIN users AS parties ON ${partyJoin}
      LEFT JOIN cities ON cities.id = parties.city_id
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
export const completeReservation = reservationAction(
  "store_id",
  "You are not allowed to confirm the pickup of this reservation.",
  (reservation) =>
    reservation.status !== "Confirmed"
      ? { status: 400, error: "Only accepted reservations can be marked as picked up." }
      : null,
  (client, storeId, reservation) => completeOrder(client, storeId, reservation.order_id),
  "Reservation marked as picked up.",
  "Error while confirming pickup:",
  "An error occurred while confirming the pickup.",
);

// The restaurant did not come: the store cancels a Confirmed reservation whose pickup day has passed.
export const cancelOverdueReservation = reservationAction(
  "store_id",
  "You are not allowed to cancel this reservation.",
  (reservation) =>
    reservation.status !== "Confirmed" || !reservation.is_overdue
      ? { status: 400, error: "Only overdue pickups can be cancelled." }
      : null,
  (client, storeId, reservation) => cancelOverdueOrder(client, storeId, reservation.order_id),
  "Overdue reservation cancelled.",
  "Error while cancelling overdue reservation:",
  "An error occurred while cancelling the reservation.",
);
