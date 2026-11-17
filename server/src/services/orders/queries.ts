import type { Request } from "express";
import pool from "../../config/db.js";
import { parseId } from "../../utils/params.js";
import { ADMIN_PAGE_SIZE, CARD_PAGE_SIZE, listPage, parsePage, parseSort } from "../../utils/pagination.js";
import { parseCityFilter } from "../../utils/cities.js";
import { parseOrderCode } from "./codes.js";
import { storeLogo } from "../../utils/branding.js";
import { IS_OVERDUE, ORDER_STATUSES } from "./status.js";

// The order lists and details of /api/orders: the order lists (filters, sorts, scopes,
// paging) over orders. A list row is the order with its items and totals:
// - ordered_total: what the order sent (unit_price × ordered_quantity);
// - total: the current amount (unit_price × quantity of every item the store did not reject): what
//   was sent while Pending, the accepted amount afterwards;
// - is_partial: Confirmed or Completed with an item rejected or accepted with less.

const LINES = `JOIN LATERAL (
    SELECT COUNT(*) AS item_count,
           COUNT(*) FILTER (WHERE order_items.status IN ('Confirmed', 'Completed')) AS accepted_count,
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
             'status', order_items.status
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
       'tracking_url', deliveries.tracking_url, 'failure_reason', deliveries.failure_reason,
       'picked_up_at', deliveries.picked_up_at, 'delivered_at', deliveries.delivered_at)
     FROM deliveries WHERE deliveries.order_id = orders.id) AS delivery,
    orders.decided_at, orders.picked_up_at, orders.created_at, orders.updated_at,
    orders.store_id, orders.restaurant_id,
    ${IS_OVERDUE} AS is_overdue,
    lines.item_count::int AS item_count, lines.accepted_count::int AS accepted_count,
    lines.ordered_total::text AS ordered_total, lines.current_total::text AS total,
    orders.status IN ('Confirmed', 'Completed') AND lines.has_changes AS is_partial,
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

// Periods by created_at, a timestamp in the session time zone, so CURRENT_DATE is local midnight.
const MINE_PERIODS: Record<string, string> = {
  today: "orders.created_at >= CURRENT_DATE",
  "7d": "orders.created_at >= CURRENT_DATE - 6",
  month: "orders.created_at >= date_trunc('month', CURRENT_DATE)",
};

const STATUS_ORDER = `CASE orders.status
    WHEN 'Pending' THEN 0 WHEN 'Confirmed' THEN 1 WHEN 'Completed' THEN 2
    WHEN 'Rejected' THEN 3 WHEN 'Cancelled' THEN 4 END`;

const MINE_SORTS: Record<string, string> = {
  newest: "orders.created_at DESC, orders.id DESC",
  status: `${STATUS_ORDER}, orders.created_at DESC, orders.id DESC`,
  pickup: "orders.pickup_at ASC, orders.id DESC",
};

// FROM/WHERE shared by GET /orders/mine and /mine/summary: the restaurant's own orders with the
// product name, store and period filters (and status for the list). Null for an invalid filter.
const mineFilters = (query: Request["query"], restaurantId: number, includeStatus: boolean) => {
  const { status, name, business_name, store_id } = query;
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
  if (business_name) {
    values.push(`%${business_name}%`);
    from += ` AND stores.business_name ILIKE $${values.length}`;
  }
  if (store_id) {
    const storeId = parseId(store_id);
    if (storeId === null) return null;
    values.push(storeId);
    from += ` AND orders.store_id = $${values.length}`;
  }
  const period = optionalParam(query.period, MINE_PERIODS);
  if (period === null) return null;
  if (period) from += ` AND ${period}`;
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
  if (scope === "active") from += ` AND orders.status IN ('Pending', 'Confirmed')`;
  const { rows, total } = await listPage(
    // party_logo_url: the other side's logo (a branch without one shows its company's).
    `${ORDER_COLUMNS}, stores.business_name, cities.name AS city, ${storeLogo("stores")} AS party_logo_url`,
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
    Completed: parseInt(row.completed, 10),
    Rejected: parseInt(row.rejected, 10),
    Cancelled: parseInt(row.cancelled, 10),
  };
  return { total: parseInt(row.total, 10), active: counts.Pending + counts.Confirmed, counts };
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

export const PICKUP_SCOPES =["today", "upcoming", "completed"];

// The pickups page: the caller's orders through orders.store_id (store) or restaurant_id;
// `parties` is the other side of the handover.
const pickupOwnership = (role: string) =>
  role === "STORE"
    ? { owner: "orders.store_id = $1", partyJoin: "orders.restaurant_id = parties.id" }
    : { owner: "orders.restaurant_id = $1", partyJoin: "orders.store_id = parties.id" };

// Today (and late ones from earlier days), upcoming, or picked up (the only paged scope: an open
// or late pickup must never hide on a later page). Null for an invalid filter.
export const listPickupOrders = async (userId: number, role: string, query: Request["query"]) => {
  const { scope, name } = query;
  if (typeof scope !== "string" || !PICKUP_SCOPES.includes(scope)) return null;
  const page = scope === "completed" ? parsePage(query, CARD_PAGE_SIZE) : null;
  if (scope === "completed" && !page) return null;
  const { owner, partyJoin } = pickupOwnership(role);
  const columns = `${ORDER_COLUMNS},
    CASE WHEN orders.fulfilment_method = 'PICKUP' THEN GREATEST(CURRENT_DATE - orders.pickup_at::date, 0) ELSE 0 END AS days_overdue,
    parties.business_name, cities.name AS city, parties.phone AS party_phone,
    parties.address AS party_address, parties.pickup_hours AS party_pickup_hours,
    parties.pickup_schedule AS party_pickup_schedule,
    ${storeLogo("parties")} AS party_logo_url`;
  let from = `FROM orders
    JOIN users AS parties ON ${partyJoin}
    LEFT JOIN cities ON cities.id = parties.city_id
    ${LINES}
    WHERE ${owner}`;
  const values: (string | number)[] = [userId];
  if (scope === "today") {
    from += ` AND orders.status = 'Confirmed' AND orders.pickup_at::date <= CURRENT_DATE`;
  } else if (scope === "upcoming") {
    from += ` AND orders.status = 'Confirmed' AND orders.pickup_at::date > CURRENT_DATE`;
  } else {
    from += ` AND orders.status = 'Completed'`;
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
  const { owner } = pickupOwnership(role);
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE orders.status = 'Confirmed' AND orders.pickup_at::date <= CURRENT_DATE) AS today,
       COUNT(*) FILTER (WHERE ${IS_OVERDUE}) AS overdue,
       COUNT(*) FILTER (WHERE orders.status = 'Confirmed' AND orders.pickup_at::date > CURRENT_DATE) AS upcoming,
       COUNT(*) FILTER (WHERE orders.status = 'Completed') AS completed
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

const PARTY_COLUMNS = (alias: string, cityAlias: string) => `json_build_object(
    'id', ${alias}.id,
    'business_name', ${alias}.business_name,
    'city', ${cityAlias}.name,
    'address', ${alias}.address,
    'phone', ${alias}.phone,
    'pickup_hours', ${alias}.pickup_hours,
    'pickup_schedule', ${alias}.pickup_schedule,
    'logo_url', ${storeLogo(alias)}
  )`;

// One order for one of its two parties (null for anyone else), or for the admin (`userId` null):
// the order, its items with the store's changes, both parties, the changes made at sending and
// the history.
export const getOrderDetails = async (orderId: number, userId: number | null) => {
  const result = await pool.query(
    `SELECT ${ORDER_COLUMNS}, orders.send_changes,
       ${PARTY_COLUMNS("stores", "store_cities")} AS store,
       ${PARTY_COLUMNS("restaurants", "restaurant_cities")} AS restaurant
     FROM orders
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
  return { ...order, items: lines, history: history.rows };
};
