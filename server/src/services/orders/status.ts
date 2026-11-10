import type { PoolClient } from "pg";
import type { OrderRow } from "./codes.js";

// Order and item statuses (docs/orders-design.md, section 2). An item is today's reservation row.
// The order's status is never set directly: syncOrderStatus derives it from its items after every
// item change, in the same transaction, and records the change in order_status_history.

export const ORDER_STATUSES = ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Who caused a change: the restaurant, the store, an admin, or the system (the expiry job,
// blocking cascades, a closed branch). Phase 2 adds PROVIDER.
export type OrderEventSource = "RESTAURANT" | "STORE" | "ADMIN" | "SYSTEM";

export interface OrderEvent {
  source: OrderEventSource;
  actorId?: number | null;
  // An admin's reason.
  reason?: string | null;
}

// Pending while any item waits; then Completed, Confirmed, Rejected in that order; Cancelled
// only when every item is. A partly accepted order has no status of its own (Confirmed or
// Completed with an item rejected or reduced).
export const deriveOrderStatus = (itemStatuses: string[]): OrderStatus => {
  for (const status of ["Pending", "Completed", "Confirmed", "Rejected"] as const) {
    if (itemStatuses.includes(status)) return status;
  }
  return "Cancelled";
};

const insertHistory = (
  client: PoolClient,
  orderId: number,
  itemId: number | null,
  from: string | null,
  to: string,
  event: OrderEvent,
) =>
  client.query(
    `INSERT INTO order_status_history (order_id, item_id, from_status, to_status, source, actor_id, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orderId, itemId, from, to, event.source, event.actorId ?? null, event.reason ?? null],
  );

// The creation row of a new order (from null to Pending).
export const recordOrderCreated = (client: PoolClient, orderId: number, event: OrderEvent) =>
  insertHistory(client, orderId, null, null, "Pending", event);

// Item rows are written only when items of one order move differently (a decision with changes,
// items dropped by expiry or moderation); when they all move together the order's row says it.
export const recordItemChanges = async (
  client: PoolClient,
  orderId: number,
  items: { id: number; from: string; to: string }[],
  event: OrderEvent,
) => {
  for (const item of items) {
    await insertHistory(client, orderId, item.id, item.from, item.to, event);
  }
};

// Derives the order's status from its items, stores it and records the change. The caller holds
// the order's row lock. Returns the order as it is now.
export const syncOrderStatus = async (client: PoolClient, orderId: number, event: OrderEvent) => {
  const items = await client.query<{ status: string }>(
    "SELECT reservations.status FROM reservations WHERE reservations.order_id = $1",
    [orderId],
  );
  const next = deriveOrderStatus(items.rows.map((item) => item.status));
  const current = await client.query<OrderRow>("SELECT * FROM orders WHERE orders.id = $1", [orderId]);
  const from = current.rows[0]!.status;
  if (from === next) return current.rows[0]!;
  const updated = await client.query<OrderRow>(
    "UPDATE orders SET status = $2 WHERE orders.id = $1 RETURNING *",
    [orderId, next],
  );
  await insertHistory(client, orderId, null, from, next, event);
  return updated.rows[0]!;
};

// Locks one order (the first lock of every order path: orders, then products in ascending id,
// then the store's subscription). is_overdue: Confirmed and the whole pickup day has passed.
export const lockOrder = async (client: PoolClient, orderId: number) => {
  const result = await client.query<OrderRow & { is_overdue: boolean }>(
    `SELECT orders.*, orders.status = 'Confirmed' AND orders.pickup_at::date < CURRENT_DATE AS is_overdue
     FROM orders WHERE orders.id = $1 FOR UPDATE`,
    [orderId],
  );
  return result.rows[0] ?? null;
};

export interface ItemRow {
  id: number;
  order_id: number;
  product_id: number;
  restaurant_id: number;
  quantity: string;
  ordered_quantity: string;
  unit_price: string;
  status: string;
  product_name: string;
  unit: string;
  product_quantity: string;
  product_status: string;
  store_id: number;
  is_expired: boolean;
}

// The order's items with their products, the products locked in ascending id (the caller holds
// the order's lock already).
export const lockOrderItems = async (client: PoolClient, orderId: number) => {
  const result = await client.query<ItemRow>(
    `SELECT reservations.id, reservations.order_id, reservations.product_id, reservations.restaurant_id,
            reservations.quantity, reservations.ordered_quantity, reservations.unit_price, reservations.status,
            products.name AS product_name, products.unit, products.quantity AS product_quantity,
            products.status AS product_status, products.store_id,
            products.expiry_date < CURRENT_DATE AS is_expired
     FROM reservations
     JOIN products ON products.id = reservations.product_id
     WHERE reservations.order_id = $1
     ORDER BY products.id
     FOR UPDATE OF products`,
    [orderId],
  );
  return result.rows;
};

// Moves the order's items in `from` to `to`; returns the moved ones (id, product, old status).
export const moveItems = async (
  client: PoolClient,
  orderId: number,
  from: string[],
  to: string,
  { pickedUp = false }: { pickedUp?: boolean } = {},
) => {
  const result = await client.query<{ id: number; product_id: number }>(
    `UPDATE reservations
     SET status = $3${pickedUp ? ", picked_up_at = NOW()" : ""}
     WHERE reservations.order_id = $1 AND reservations.status = ANY($2::reservation_status[])
     RETURNING reservations.id, reservations.product_id`,
    [orderId, from, to],
  );
  return result.rows;
};
