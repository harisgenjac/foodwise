import type { Request } from "express";
import pool from "../../config/db.js";
import { parseId } from "../../utils/params.js";
import { ADMIN_PAGE_SIZE, CARD_PAGE_SIZE, listPage, parsePage, parseSort } from "../../utils/pagination.js";
import { parseCityFilter } from "../../utils/cities.js";
import { parseOrderCode } from "./codes.js";
import { storeLogo } from "../../utils/branding.js";
import { AUTO_REJECT_AT, IS_OVERDUE, ORDER_STATUSES } from "./status.js";
import { PROBLEM_REPORT_HOURS } from "../orderProblems.js";
import { COURIER_RATING_DAYS } from "../courierRatings.js";
import { isValidDate } from "../../utils/dates.js";

// The order lists and details of /api/orders: the order lists (filters, sorts, scopes,
// paging) over orders. A list row is the order with its items and totals:
// - ordered_total: what the order sent (unit_price × ordered_quantity);
// - total: the current amount (unit_price × quantity of every item the store did not reject): what
//   was sent while Pending, the accepted amount afterwards;
// - is_partial: Confirmed or Completed with an item rejected or accepted with less.

const LINES = `JOIN LATERAL (
    SELECT COUNT(*) AS item_count,
           COUNT(*) FILTER (WHERE order_items.status IN ('Confirmed', 'InDelivery', 'Completed')) AS accepted_count,
           COALESCE(SUM(order_items.unit_price * order_items.ordered_quantity), 0) AS ordered_total,
           COALESCE(SUM(order_items.unit_price * order_items.quantity)
             FILTER (WHERE order_items.status <> 'Rejected'), 0) AS current_total,
           COALESCE(BOOL_OR(order_items.status = 'Rejected'
             OR order_items.quantity < order_items.ordered_quantity), false) AS has_changes,
           json_agg(json_build_object(
             'id', order_items.id,
             'product_id', order_items.product_id,
             'product_name', products.name,
             'category', products.category,
             'image_url', products.image_url,
             'unit', products.unit,
             'quantity', order_items.quantity::text,
             'ordered_quantity', order_items.ordered_quantity::text,
             'unit_price', order_items.unit_price::text,
             'status', order_items.status,
             'change_reason', order_items.change_reason,
             'change_note', order_items.change_note
           ) ORDER BY order_items.id) AS items
    FROM order_items
    JOIN products ON products.id = order_items.product_id
    WHERE order_items.order_id = orders.id
  ) AS lines ON true`;

const ORDER_COLUMNS = `
    orders.id, orders.code, orders.status, orders.fulfilment_method, orders.pickup_at, orders.accept_partial,
    orders.delivery_address, orders.delivery_fee_estimate::text AS delivery_fee_estimate, orders.delivery_estimated_at,
    orders.ready_at,
    (SELECT json_build_object(
       'status', deliveries.status, 'price', deliveries.price::text,
       'cash_to_collect', deliveries.cash_to_collect::text,
       'estimated_pickup_at', deliveries.estimated_pickup_at, 'estimated_delivery_at', deliveries.estimated_delivery_at,
       'courier_name', deliveries.courier_name, 'courier_phone', deliveries.courier_phone,
       'courier_photo_url', deliveries.courier_photo_url, 'courier_vehicle', deliveries.courier_vehicle,
       'tracking_url', deliveries.tracking_url, 'failure_code', deliveries.failure_code,
       'failure_reason', deliveries.failure_reason,
       'failed_after_pickup', deliveries.status IN ('FAILED', 'CANCELLED') AND deliveries.picked_up_at IS NOT NULL,
       'picked_up_at', deliveries.picked_up_at, 'delivered_at', deliveries.delivered_at,
       'ready_at', deliveries.ready_at, 'courier_assigned_at', deliveries.courier_assigned_at,
       'failed_at', deliveries.failed_at)
     FROM deliveries WHERE deliveries.order_id = orders.id) AS delivery,
    orders.decided_at, orders.picked_up_at, orders.created_at, orders.updated_at,
    orders.store_id, orders.restaurant_id,
    ${IS_OVERDUE} AS is_overdue,
    CASE WHEN orders.status = 'Pending' THEN ${AUTO_REJECT_AT} END AS auto_reject_at,
    lines.item_count::int AS item_count, lines.accepted_count::int AS accepted_count,
    lines.ordered_total::text AS ordered_total, lines.current_total::text AS total,
    orders.status IN ('Confirmed', 'InDelivery', 'Completed') AND lines.has_changes AS is_partial,
    lines.items`;

// An order containing a product whose name matches $n.
const productNameMatches = (param: string) => `EXISTS (
    SELECT 1 FROM order_items
    JOIN products ON products.id = order_items.product_id
    WHERE order_items.order_id = orders.id AND products.name ILIKE ${param})`;

// An empty value means "not set", as the client sends unused parameters.
const optionalParam = (value: unknown, allowed: Record<string, string>): string | null | undefined => {
  if (value === undefined || value === "") return undefined;
  return typeof value === "string" && Object.hasOwn(allowed, value) ? allowed[value]! : null;
};

const isOrderStatus = (value: unknown): value is string =>
  typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);

// The order date range: YYYY-MM-DD or empty (not set). Null for a date that is not valid.
const optionalDate = (value: unknown) => {
  if (value === undefined || value === "") return undefined;
  return isValidDate(value) ? value : null;
};

const STATUS_ORDER = `CASE orders.status
    WHEN 'Pending' THEN 0 WHEN 'Confirmed' THEN 1 WHEN 'InDelivery' THEN 2 WHEN 'Completed' THEN 3
    WHEN 'Rejected' THEN 4 WHEN 'Cancelled' THEN 5 END`;

const MINE_SORTS: Record<string, string> = {
  newest: "orders.created_at DESC, orders.id DESC",
  status: `${STATUS_ORDER}, orders.created_at DESC, orders.id DESC`,
  pickup: "orders.pickup_at ASC, orders.id DESC",
};

const MINE_METHODS: Record<string, string> = { pickup: "PICKUP", delivery: "DELIVERY" };

// FROM/WHERE shared by GET /orders/mine and /mine/summary: the restaurant's own orders with the
// search (q: a product, the store's name or the code), product name, method, store and order date
// range (from/to, whole local days) filters (and status for the list). Null for an invalid filter.
const mineFilters = (query: Request["query"], restaurantId: number, includeStatus: boolean) => {
  const { status, name, q, store_id } = query;
  let from = `FROM orders
    JOIN users AS stores ON stores.id = orders.store_id
    LEFT JOIN cities ON cities.id = stores.city_id
    ${LINES}
    WHERE orders.restaurant_id = $1`;
  const values: (string | number)[] = [restaurantId];
  if (includeStatus && status) {
    if (!isOrderStatus(status)) return null;
    values.push(status);
    from += ` AND orders.status = $${values.length}`;
  }
  if (name) {
    values.push(`%${name}%`);
    from += ` AND ${productNameMatches(`$${values.length}`)}`;
  }
  if (typeof q === "string" && q.trim()) {
    values.push(`%${q.trim()}%`);
    const p = `$${values.length}`;
    let match = `${productNameMatches(p)} OR stores.business_name ILIKE ${p}`;
    // Text that can be a code (with or without #, any case) also finds the orders whose code starts with it.
    const code = parseOrderCode(q);
    if (code !== null) {
      values.push(`${code}%`);
      match += ` OR orders.code LIKE $${values.length}`;
    }
    from += ` AND (${match})`;
  } else if (q !== undefined && typeof q !== "string") {
    return null;
  }
  const method = optionalParam(query.method, MINE_METHODS);
  if (method === null) return null;
  if (method) {
    values.push(method);
    from += ` AND orders.fulfilment_method = $${values.length}`;
  }
  if (store_id) {
    const storeId = parseId(store_id);
    if (storeId === null) return null;
    values.push(storeId);
    from += ` AND orders.store_id = $${values.length}`;
  }
  // created_at is a timestamp in the session time zone, so a date compares as local midnight.
  const dateFrom = optionalDate(query.from);
  const dateTo = optionalDate(query.to);
  if (dateFrom === null || dateTo === null || (dateFrom && dateTo && dateFrom > dateTo)) return null;
  if (dateFrom) {
    values.push(dateFrom);
    from += ` AND orders.created_at >= $${values.length}::date`;
  }
  if (dateTo) {
    values.push(dateTo);
    from += ` AND orders.created_at < $${values.length}::date + 1`;
  }
  return { from, values };
};

export const listMineOrders = async (restaurantId: number, query: Request["query"]) => {
  const page = parsePage(query, CARD_PAGE_SIZE);
  const filters = mineFilters(query, restaurantId, true);
  const scope = optionalParam(query.scope, { active: "active", all: "all" });
  const sort = optionalParam(query.sort, MINE_SORTS);
  if (!page || !filters || scope === null || sort === null) return null;
  let { from } = filters;
  // "active" is what still needs the restaurant's attention.
  if (scope === "active") from += ` AND orders.status IN ('Pending', 'Confirmed', 'InDelivery')`;
  const { rows, total } = await listPage(
    // party_logo_url: the other side's logo (a branch without one shows its company's);
    // party_address: the store's address, for the pickup step.
    `${ORDER_COLUMNS}, stores.business_name, cities.name AS city, stores.address AS party_address,
     ${storeLogo("stores")} AS party_logo_url`,
    from,
    sort ?? MINE_SORTS.status!,
    filters.values,
    page,
  );
  return { orders: rows, total };
};

// Counts per status for the list's filters, except scope and status.
export const summarizeMineOrders = async (restaurantId: number, query: Request["query"]) => {
  const filters = mineFilters(query, restaurantId, false);
  if (!filters) return null;
  const result = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE orders.status = 'Pending') AS pending,
       COUNT(*) FILTER (WHERE orders.status = 'Confirmed') AS confirmed,
       COUNT(*) FILTER (WHERE orders.status = 'InDelivery') AS in_delivery,
       COUNT(*) FILTER (WHERE orders.status = 'Completed') AS completed,
       COUNT(*) FILTER (WHERE orders.status = 'Rejected') AS rejected,
       COUNT(*) FILTER (WHERE orders.status = 'Cancelled') AS cancelled
     ${filters.from}`,
    filters.values,
  );
  const row = result.rows[0];
  const counts = {
    Pending: parseInt(row.pending, 10),
    Confirmed: parseInt(row.confirmed, 10),
    InDelivery: parseInt(row.in_delivery, 10),
    Completed: parseInt(row.completed, 10),
    Rejected: parseInt(row.rejected, 10),
    Cancelled: parseInt(row.cancelled, 10),
  };
  return { total: parseInt(row.total, 10), active: counts.Pending + counts.Confirmed + counts.InDelivery, counts };
};

// The orders of a store (GET /orders/store), Pending first. Null for an invalid filter or page.
export const listStoreOrders = async (storeId: number, query: Request["query"]) => {
  const { status, name, city_id, code } = query;
  const page = parsePage(query, CARD_PAGE_SIZE);
  if (!page) return null;
  let from = `FROM orders
    JOIN users AS restaurants ON restaurants.id = orders.restaurant_id
    LEFT JOIN cities ON cities.id = restaurants.city_id
    ${LINES}
    WHERE orders.store_id = $1`;
  const values: (string | number)[] = [storeId];
  if (status) {
    if (!isOrderStatus(status)) return null;
    values.push(status);
    from += ` AND orders.status = $${values.length}`;
  }
  if (name) {
    values.push(`%${name}%`);
    from += ` AND ${productNameMatches(`$${values.length}`)}`;
  }
  if (code) {
    const parsed = parseOrderCode(code);
    if (parsed === null) return null;
    values.push(`${parsed}%`);
    from += ` AND orders.code LIKE $${values.length}`;
  }
  // The restaurant's city.
  const cityFilter = await parseCityFilter(pool, city_id);
  if ("invalid" in cityFilter) return null;
  if (cityFilter.cityId !== null) {
    values.push(cityFilter.cityId);
    from += ` AND restaurants.city_id = $${values.length}`;
  }
  const { rows, total } = await listPage(
    `${ORDER_COLUMNS}, restaurants.business_name, cities.name AS city, ${storeLogo("restaurants")} AS party_logo_url`,
    from,
    "CASE WHEN orders.status = 'Pending' THEN 0 ELSE 1 END, orders.created_at DESC, orders.id DESC",
    values,
    page,
  );
  return { orders: rows, total };
};

const ADMIN_SORTS = { pickup_at: "orders.pickup_at" };

// Every order on the platform for the admin (GET /admin/orders), newest first: filters by status,
// by a user on either side, and a search over the product names, both businesses (name or email)
// and the code. Null for an invalid filter, page or sort.
export const listAdminOrders = async (query: Request["query"]) => {
  const { q, status, user_id } = query;
  const page = parsePage(query, ADMIN_PAGE_SIZE);
  const orderBy = parseSort(query, ADMIN_SORTS, "orders.created_at DESC, orders.id DESC", "orders.id DESC");
  if (!page || !orderBy) return null;
  let from = `FROM orders
    JOIN users AS stores ON stores.id = orders.store_id
    JOIN users AS restaurants ON restaurants.id = orders.restaurant_id
    ${LINES}
    WHERE true`;
  const values: (string | number)[] = [];
  if (status) {
    if (!isOrderStatus(status)) return null;
    values.push(status);
    from += ` AND orders.status = $${values.length}`;
  }
  if (user_id) {
    const userId = parseId(user_id);
    if (userId === null) return null;
    values.push(userId);
    from += ` AND (orders.store_id = $${values.length} OR orders.restaurant_id = $${values.length})`;
  }
  if (typeof q === "string" && q.trim()) {
    values.push(`%${q.trim()}%`);
    const p = `$${values.length}`;
    let match = `${productNameMatches(p)} OR stores.business_name ILIKE ${p} OR stores.email ILIKE ${p}
      OR restaurants.business_name ILIKE ${p} OR restaurants.email ILIKE ${p}`;
    // Text that can be a code (with or without #) also finds the orders whose code starts with it.
    const code = parseOrderCode(q);
    if (code !== null) {
      values.push(`${code}%`);
      match += ` OR orders.code LIKE $${values.length}`;
    }
    from += ` AND (${match})`;
  } else if (q !== undefined && typeof q !== "string") {
    return null;
  }
  const { rows, total } = await listPage(
    `${ORDER_COLUMNS},
     stores.business_name AS store_name, stores.email AS store_email,
     restaurants.business_name AS restaurant_name, restaurants.email AS restaurant_email`,
    from,
    orderBy,
    values,
    page,
  );
  return { orders: rows, total };
};

const PICKUP_SCOPES =["today", "upcoming", "completed"];

// The pickups page: the caller's orders through orders.store_id (store) or restaurant_id;
// `parties` is the other side of the handover.
// An InDelivery order (the courier has the goods) is the store's history at once, and the
// restaurant's Today until it is delivered.
const pickupOwnership = (role: string) => {
  const due = "(orders.status = 'Confirmed' AND orders.pickup_at::date <= CURRENT_DATE)";
  return role === "STORE"
    ? {
        owner: "orders.store_id = $1",
        partyJoin: "orders.restaurant_id = parties.id",
        today: due,
        completed: "orders.status IN ('InDelivery', 'Completed')",
      }
    : {
        owner: "orders.restaurant_id = $1",
        partyJoin: "orders.store_id = parties.id",
        today: `(${due} OR orders.status = 'InDelivery')`,
        completed: "orders.status = 'Completed'",
      };
};

// Today (and late ones from earlier days), upcoming, or picked up (the only paged scope: an open
// or late pickup must never hide on a later page). Null for an invalid filter.
export const listPickupOrders = async (userId: number, role: string, query: Request["query"]) => {
  const { scope, name } = query;
  if (typeof scope !== "string" || !PICKUP_SCOPES.includes(scope)) return null;
  const page = scope === "completed" ? parsePage(query, CARD_PAGE_SIZE) : null;
  if (scope === "completed" && !page) return null;
  const { owner, partyJoin, today, completed } = pickupOwnership(role);
  const columns = `${ORDER_COLUMNS},
    CASE WHEN orders.fulfilment_method = 'PICKUP' THEN GREATEST(CURRENT_DATE - orders.pickup_at::date, 0) ELSE 0 END AS days_overdue,
    parties.business_name, cities.name AS city, parties.phone AS party_phone,
    parties.address AS party_address,
    parties.pickup_schedule AS party_pickup_schedule,
    ${storeLogo("parties")} AS party_logo_url`;
  let from = `FROM orders
    JOIN users AS parties ON ${partyJoin}
    LEFT JOIN cities ON cities.id = parties.city_id
    ${LINES}
    WHERE ${owner}`;
  const values: (string | number)[] = [userId];
  if (scope === "today") {
    from += ` AND ${today}`;
  } else if (scope === "upcoming") {
    from += ` AND orders.status = 'Confirmed' AND orders.pickup_at::date > CURRENT_DATE`;
  } else {
    from += ` AND ${completed}`;
  }
  if (name) {
    values.push(`%${name}%`);
    from += ` AND ${productNameMatches(`$${values.length}`)}`;
  }
  if (page) {
    const { rows, total } = await listPage(
      columns,
      from,
      "orders.picked_up_at DESC NULLS LAST, orders.pickup_at DESC, orders.id DESC",
      values,
      page,
    );
    return { orders: rows, total };
  }
  // Open pickups by time (missed ones from earlier days come first), all of them.
  const result = await pool.query(`SELECT ${columns} ${from} ORDER BY orders.pickup_at ASC, orders.id ASC`, values);
  return { orders: result.rows };
};

export const countPickupOrders = async (userId: number, role: string) => {
  const { owner, today, completed } = pickupOwnership(role);
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ${today}) AS today,
       COUNT(*) FILTER (WHERE ${IS_OVERDUE}) AS overdue,
       COUNT(*) FILTER (WHERE orders.status = 'Confirmed' AND orders.pickup_at::date > CURRENT_DATE) AS upcoming,
       COUNT(*) FILTER (WHERE ${completed}) AS completed
     FROM orders
     WHERE ${owner}`,
    [userId],
  );
  const row = result.rows[0];
  return {
    today: parseInt(row.today, 10),
    overdue: parseInt(row.overdue, 10),
    upcoming: parseInt(row.upcoming, 10),
    completed: parseInt(row.completed, 10),
  };
};

// When the goods must be ready, as local wall-clock time like pickup_at: the ready time the store
// chose for a delivery (a timestamptz), the pickup time for a pickup.
const READY_TIME = `(CASE WHEN orders.fulfilment_method = 'DELIVERY' AND orders.ready_at IS NOT NULL
    THEN orders.ready_at AT TIME ZONE current_setting('TimeZone') ELSE orders.pickup_at END)`;

// The orders a store packs today: accepted, ready today, not yet with the courier or picked up.
// Missed pickups from earlier days stay on the pickups page.
const PACKING_ORDERS = `orders.store_id = $1 AND orders.status = 'Confirmed' AND ${READY_TIME}::date = CURRENT_DATE`;

// The store's packing list: today's orders by ready time with their items, and every accepted
// product summed over those orders.
export const listPackingList = async (storeId: number) => {
  const orders = await pool.query(
    `SELECT ${ORDER_COLUMNS},
       ${READY_TIME} AS ready_time,
       restaurants.business_name, cities.name AS city, restaurants.phone AS party_phone,
       ${storeLogo("restaurants")} AS party_logo_url
     FROM orders
     JOIN users AS restaurants ON restaurants.id = orders.restaurant_id
     LEFT JOIN cities ON cities.id = restaurants.city_id
     ${LINES}
     WHERE ${PACKING_ORDERS}
     ORDER BY ready_time ASC, orders.id ASC`,
    [storeId],
  );
  const products = await pool.query(
    `SELECT products.id AS product_id, products.name AS product_name, products.unit, products.image_url,
       SUM(order_items.quantity)::text AS quantity, COUNT(DISTINCT orders.id)::int AS order_count
     FROM order_items
     JOIN orders ON orders.id = order_items.order_id
     JOIN products ON products.id = order_items.product_id
     WHERE ${PACKING_ORDERS} AND order_items.status = 'Confirmed'
     GROUP BY products.id, products.name, products.unit, products.image_url
     ORDER BY products.name ASC, products.id ASC`,
    [storeId],
  );
  return { orders: orders.rows, products: products.rows };
};

// The store home page's "Danas" order counts. Each accepted order is in at most one of them, by its
// ready time (the app has no "ready" status):
// - to_prepare: accepted, ready today and that time still ahead (the earliest as first_ready_at);
// - to_hand_over: accepted and that time already passed, missed ones from earlier days included,
//   split by method (a delivery order leaves this once the courier has it: InDelivery).
// `pending` waits for the store's answer; first_deadline is the closest automatic rejection.
export const countStoreToday = async (storeId: number) => {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE orders.status = 'Pending') AS pending,
       MIN(${AUTO_REJECT_AT}) FILTER (WHERE orders.status = 'Pending') AS first_deadline,
       COUNT(*) FILTER (WHERE ${TO_PREPARE}) AS to_prepare,
       MIN(${READY_TIME}) FILTER (WHERE ${TO_PREPARE}) AS first_ready_at,
       COUNT(*) FILTER (WHERE ${TO_HAND_OVER} AND orders.fulfilment_method = 'DELIVERY') AS hand_over_courier,
       COUNT(*) FILTER (WHERE ${TO_HAND_OVER} AND orders.fulfilment_method = 'PICKUP') AS hand_over_pickup
     FROM orders
     WHERE orders.store_id = $1 AND orders.status IN ('Pending', 'Confirmed')`,
    [storeId],
  );
  const row = result.rows[0];
  return {
    pending: parseInt(row.pending, 10),
    first_deadline: row.first_deadline as Date | null,
    to_prepare: parseInt(row.to_prepare, 10),
    first_ready_at: row.first_ready_at as Date | null,
    hand_over_courier: parseInt(row.hand_over_courier, 10),
    hand_over_pickup: parseInt(row.hand_over_pickup, 10),
  };
};

const TO_PREPARE = `(orders.status = 'Confirmed' AND ${READY_TIME}::date = CURRENT_DATE AND ${READY_TIME} > LOCALTIMESTAMP)`;
const TO_HAND_OVER = `(orders.status = 'Confirmed' AND ${READY_TIME} <= LOCALTIMESTAMP)`;

// The store's most urgent orders waiting for its answer: the closest automatic rejection first
// (every Pending order has one), then the oldest. List rows with all their items and the restaurant.
export const listUrgentPendingOrders = async (storeId: number, limit: number) => {
  const result = await pool.query(
    `SELECT ${ORDER_COLUMNS},
       restaurants.business_name, cities.name AS city, ${storeLogo("restaurants")} AS party_logo_url
     FROM orders
     JOIN users AS restaurants ON restaurants.id = orders.restaurant_id
     LEFT JOIN cities ON cities.id = restaurants.city_id
     ${LINES}
     WHERE orders.store_id = $1 AND orders.status = 'Pending'
     ORDER BY ${AUTO_REJECT_AT} ASC, orders.created_at ASC, orders.id ASC
     LIMIT $2`,
    [storeId, limit],
  );
  return result.rows;
};

const PARTY_COLUMNS = (alias: string, cityAlias: string) => `json_build_object(
    'id', ${alias}.id,
    'business_name', ${alias}.business_name,
    'city', ${cityAlias}.name,
    'address', ${alias}.address,
    'phone', ${alias}.phone,
    'pickup_schedule', ${alias}.pickup_schedule,
    'logo_url', ${storeLogo(alias)}
  )`;

// The order's last move to its closing status (Completed, Rejected, Cancelled) while it has one:
// when it finished and who closed it.
const FINISH = `(SELECT json_build_object('at', order_status_history.created_at, 'source', order_status_history.source)
    FROM order_status_history
    WHERE order_status_history.order_id = orders.id AND order_status_history.item_id IS NULL
      AND order_status_history.to_status = orders.status::text
      AND orders.status IN ('Completed', 'Rejected', 'Cancelled')
    ORDER BY order_status_history.created_at DESC, order_status_history.id DESC LIMIT 1)`;

// The automatic rejection (jobs/autoRejectOrders.ts): the order's move to Rejected by the system.
const AUTO_REJECTED_AT = `(SELECT MIN(order_status_history.created_at) FROM order_status_history
    WHERE order_status_history.order_id = orders.id AND order_status_history.item_id IS NULL
      AND order_status_history.to_status = 'Rejected' AND order_status_history.source = 'SYSTEM')`;

// The store's decision over the items it decided: all rejected, some rejected or reduced, or all
// accepted in full (items cancelled later keep their decision). Null before a decision.
const DECISION = `(SELECT CASE
      WHEN COUNT(*) = 0 THEN NULL
      WHEN BOOL_AND(order_items.status = 'Rejected') THEN 'REJECTED'
      WHEN BOOL_OR(order_items.status = 'Rejected' OR order_items.quantity < order_items.ordered_quantity)
        THEN 'PARTIALLY_ACCEPTED'
      ELSE 'ACCEPTED' END
    FROM order_items WHERE order_items.order_id = orders.id AND order_items.decided_at IS NOT NULL)`;

// The restaurant's problem reports for the order, oldest first, with the admin's answer.
const PROBLEMS = `COALESCE((SELECT json_agg(json_build_object(
      'id', order_problems.id, 'fulfilment_method', order_problems.fulfilment_method,
      'reason', order_problems.reason, 'text', order_problems.text, 'status', order_problems.status,
      'admin_reply', order_problems.admin_reply, 'replied_at', order_problems.replied_at,
      'resolved_at', order_problems.resolved_at, 'created_at', order_problems.created_at
    ) ORDER BY order_problems.created_at, order_problems.id)
    FROM order_problems WHERE order_problems.order_id = orders.id), '[]'::json)`;

const COURIER_RATING = `(SELECT json_build_object(
      'rating', courier_ratings.rating, 'comment', courier_ratings.comment,
      'courier_name', courier_ratings.courier_name, 'created_at', courier_ratings.created_at,
      'sent_at', courier_ratings.sent_at)
    FROM courier_ratings WHERE courier_ratings.order_id = orders.id)`;

const FINISHED_AT = `(${FINISH}->>'at')::timestamptz`;
const CLOSED = "orders.status IN ('Completed', 'Rejected', 'Cancelled')";
const DELIVERED = "orders.fulfilment_method = 'DELIVERY' AND deliveries.status = 'DELIVERED'";

// One order for one of its two parties (null for anyone else), or for the admin (`userId` null):
// the order, its items with the store's changes, both parties, the changes made at sending, the
// history, and (in the same order query) the times of its steps, the problem reports and the
// courier rating. The reports, the rating and what the restaurant can still do are for the
// restaurant and the admin only.
export const getOrderDetails = async (orderId: number, userId: number | null) => {
  const result = await pool.query(
    `SELECT ${ORDER_COLUMNS}, orders.send_changes,
       ${PARTY_COLUMNS("stores", "store_cities")} AS store,
       ${PARTY_COLUMNS("restaurants", "restaurant_cities")} AS restaurant,
       json_build_object(
         'sent_at', orders.created_at AT TIME ZONE current_setting('TimeZone'),
         'decision', COALESCE(${DECISION}, CASE WHEN ${AUTO_REJECTED_AT} IS NOT NULL THEN 'AUTO_REJECTED' END),
         'decided_at', COALESCE(orders.decided_at, ${AUTO_REJECTED_AT}),
         'courier_assigned_at', deliveries.courier_assigned_at,
         'courier_picked_up_at', deliveries.picked_up_at,
         'delivered_at', deliveries.delivered_at,
         'delivery_failed_at', deliveries.failed_at,
         'switched_to_pickup_at', orders.switched_to_pickup_at,
         'picked_up_at', CASE WHEN orders.fulfilment_method = 'PICKUP' AND orders.status = 'Completed'
                              THEN orders.picked_up_at END,
         'cancelled_at', CASE WHEN orders.status = 'Cancelled' THEN ${FINISHED_AT} END,
         'cancelled_by', CASE WHEN orders.status = 'Cancelled' THEN ${FINISH}->>'source' END,
         'finished_at', ${FINISHED_AT}
       ) AS steps,
       ${PROBLEMS} AS problems,
       ${COURIER_RATING} AS courier_rating,
       (NOT (${CLOSED}) OR ${FINISHED_AT} > NOW() - INTERVAL '${PROBLEM_REPORT_HOURS} hours') AS can_report_problem,
       CASE WHEN ${CLOSED} THEN ${FINISHED_AT} + INTERVAL '${PROBLEM_REPORT_HOURS} hours' END AS problem_report_until,
       (${DELIVERED} AND deliveries.delivered_at > NOW() - INTERVAL '${COURIER_RATING_DAYS} days'
         AND NOT EXISTS (SELECT 1 FROM courier_ratings WHERE courier_ratings.order_id = orders.id)) AS can_rate_courier,
       CASE WHEN ${DELIVERED} THEN deliveries.delivered_at + INTERVAL '${COURIER_RATING_DAYS} days' END
         AS courier_rating_until
     FROM orders
     LEFT JOIN deliveries ON deliveries.order_id = orders.id
     JOIN users AS stores ON stores.id = orders.store_id
     JOIN users AS restaurants ON restaurants.id = orders.restaurant_id
     LEFT JOIN cities AS store_cities ON store_cities.id = stores.city_id
     LEFT JOIN cities AS restaurant_cities ON restaurant_cities.id = restaurants.city_id
     ${LINES}
     WHERE orders.id = $1 AND ($2::int IS NULL OR orders.store_id = $2 OR orders.restaurant_id = $2)`,
    [orderId, userId],
  );
  const order = result.rows[0];
  if (!order) return null;
  const items = await pool.query(
    `SELECT order_items.id, order_items.product_id, order_items.quantity, order_items.ordered_quantity,
            order_items.unit_price, order_items.status, order_items.decided_at,
            order_items.change_reason, order_items.change_note, order_items.picked_up_at,
            products.name AS product_name, products.category, products.image_url, products.unit, products.original_price,
            products.expiry_date, products.shop_shortage
     FROM order_items
     JOIN products ON products.id = order_items.product_id
     WHERE order_items.order_id = $1
     ORDER BY order_items.id`,
    [orderId],
  );
  const history = await pool.query(
    `SELECT order_status_history.id, order_status_history.item_id, order_status_history.from_status,
            order_status_history.to_status, order_status_history.source, order_status_history.reason,
            order_status_history.created_at, products.name AS product_name
     FROM order_status_history
     LEFT JOIN order_items ON order_items.id = order_status_history.item_id
     LEFT JOIN products ON products.id = order_items.product_id
     WHERE order_status_history.order_id = $1
     ORDER BY order_status_history.created_at, order_status_history.id`,
    [orderId],
  );
  // What the store's till sold of the order's products is for the store (and the admin) only.
  const forStore = userId === null || userId === order.store_id;
  const lines = forStore ? items.rows : items.rows.map(({ shop_shortage: _shortage, ...item }) => item);
  if (userId !== null && userId === order.store_id) {
    // Problem reports and the courier rating are between the restaurant and the platform.
    const {
      problems: _problems,
      courier_rating: _rating,
      can_report_problem: _canReport,
      problem_report_until: _reportUntil,
      can_rate_courier: _canRate,
      courier_rating_until: _rateUntil,
      ...forTheStore
    } = order;
    return { ...forTheStore, items: lines, history: history.rows };
  }
  // The admin only looks: it never reports or rates.
  const actions = userId === null ? { can_report_problem: false, can_rate_courier: false } : {};
  return { ...order, ...actions, items: lines, history: history.rows };
};
