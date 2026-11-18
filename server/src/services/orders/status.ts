import type { PoolClient } from "pg";
import type { OrderRow } from "./codes.js";
import { absorbShopShortage } from "../stock.js";

// Order and item statuses (docs/product.md). An item is an order_items row.
// The order's status is never set directly: syncOrderStatus derives it from its items after every
// item change, in the same transaction, and records the change in order_status_history.

// InDelivery: a delivery order's courier has the goods and has not delivered them yet (Completed
// comes with the delivery).
export const ORDER_STATUSES = ["Pending", "Confirmed", "InDelivery", "Completed", "Rejected", "Cancelled"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

// Who caused a change: the restaurant, the store, an admin, the system (the expiry job,
// blocking cascades, a closed branch, an automatic rejection) or the delivery provider (the courier picked a delivery up).
export type OrderEventSource = "RESTAURANT" | "STORE" | "ADMIN" | "SYSTEM" | "PROVIDER";

export interface OrderEvent {
  source: OrderEventSource;
  actorId?: number | null;
  // An admin's reason.
  reason?: string | null;
}

// Pending while any item waits; then InDelivery, Completed, Confirmed, Rejected in that order;
// Cancelled only when every item is. A partly accepted order has no status of its own (Confirmed or
// Completed with an item rejected or reduced).
export const deriveOrderStatus = (itemStatuses: string[]): OrderStatus => {
  for (const status of ["Pending", "InDelivery", "Completed", "Confirmed", "Rejected"] as const) {
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
    "SELECT order_items.status FROM order_items WHERE order_items.order_id = $1",
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

// A late pickup: a Confirmed pickup order whose whole pickup day has passed. Late logic is only for
// pickup; a delivery order is the courier's to collect (SQL over the orders table).
export const IS_OVERDUE =
  "(orders.status = 'Confirmed' AND orders.fulfilment_method = 'PICKUP' AND orders.pickup_at::date < CURRENT_DATE)";

// How long a store has to answer a delivery order (always for today, as soon as possible).
const DELIVERY_ANSWER_MINUTES = 15;

// When a Pending order is rejected automatically if the store has not decided (local wall-clock
// time, like created_at and pickup_at; compare with LOCALTIMESTAMP): a delivery order 15 minutes
// after it was sent, a pickup order at the pickup time the restaurant chose (jobs/autoRejectOrders.ts).
export const AUTO_REJECT_AT = `(CASE WHEN orders.fulfilment_method = 'DELIVERY'
  THEN orders.created_at + INTERVAL '${DELIVERY_ANSWER_MINUTES} minutes'
  ELSE orders.pickup_at END)`;

// Locks one order (the first lock of every order path: orders, then products in ascending id,
// then the store's subscription). is_overdue: see IS_OVERDUE; is_past_answer_deadline: a Pending
// order's AUTO_REJECT_AT has passed.
export const lockOrder = async (client: PoolClient, orderId: number) => {
  const result = await client.query<OrderRow & { is_overdue: boolean; is_past_answer_deadline: boolean }>(
    `SELECT orders.*, ${IS_OVERDUE} AS is_overdue,
            (orders.status = 'Pending' AND ${AUTO_REJECT_AT} <= LOCALTIMESTAMP) AS is_past_answer_deadline
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
  // Food the till sold that Pending items hold (see absorbShopShortage).
  shop_shortage: string;
}

// The order's items with their products, the products locked in ascending id (the caller holds
// the order's lock already).
export const lockOrderItems = async (client: PoolClient, orderId: number) => {
  const result = await client.query<ItemRow>(
    `SELECT order_items.id, order_items.order_id, order_items.product_id, order_items.restaurant_id,
            order_items.quantity, order_items.ordered_quantity, order_items.unit_price, order_items.status,
            products.name AS product_name, products.unit, products.quantity AS product_quantity,
            products.status AS product_status, products.store_id,
            products.shop_shortage, products.expiry_date < CURRENT_DATE AS is_expired
     FROM order_items
     JOIN products ON products.id = order_items.product_id
     WHERE order_items.order_id = $1
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
    `UPDATE order_items
     SET status = $3${pickedUp ? ", picked_up_at = NOW()" : ""}
     WHERE order_items.order_id = $1 AND order_items.status = ANY($2::order_item_status[])
     RETURNING order_items.id, order_items.product_id`,
    [orderId, from, to],
  );
  // Freed Pending quantity first covers what the till already sold (products.shop_shortage).
  if (from.includes("Pending") && (to === "Cancelled" || to === "Rejected")) {
    const productIds = [...new Set(result.rows.map((row) => row.product_id))].sort((a, b) => a - b);
    for (const productId of productIds) await absorbShopShortage(client, productId, { orderId });
  }
  return result.rows;
};
