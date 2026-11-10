import type { PoolClient } from "pg";
import { createNotification } from "../../utils/notifications.js";
import { formatOrderCode, type OrderRow } from "./codes.js";
import { moveItems, recordItemChanges, syncOrderStatus, type OrderEvent } from "./status.js";

// What happens to orders when something outside them changes (docs/orders-design.md, section 8):
// a blocked user or company, a deactivated branch, an expired or removed product. Only Pending
// orders and items are touched; Confirmed ones stay, because the store already agreed to hand
// that food over.

// Cancels the Pending orders matching `where` (an SQL condition on `orders`, with `values`),
// locked in ascending id, and tells `recipient` once per order. `storeClosed` sends
// ORDER_CANCELLED_STORE_CLOSED (a deactivated branch) instead of ORDER_CANCELLED_BY_ADMIN.
// Returns how many orders were cancelled.
export const cancelPendingOrders = async (
  client: PoolClient,
  where: string,
  values: number[],
  recipient: (order: { store_id: number; restaurant_id: number }) => number,
  { storeClosed = false }: { storeClosed?: boolean } = {},
) => {
  const orders = await client.query<OrderRow>(
    `SELECT orders.* FROM orders
     WHERE orders.status = 'Pending' AND (${where})
     ORDER BY orders.id
     FOR UPDATE`,
    values,
  );
  for (const order of orders.rows) {
    await moveItems(client, order.id, ["Pending"], "Cancelled");
    await syncOrderStatus(client, order.id, { source: "SYSTEM" });
    const code = formatOrderCode(order.code);
    await createNotification(client, {
      userId: recipient(order),
      type: storeClosed ? "ORDER_CANCELLED_STORE_CLOSED" : "ORDER_CANCELLED_BY_ADMIN",
      message: storeClosed
        ? `Order ${code} was cancelled because the store is no longer active.`
        : `Order ${code} was cancelled by the platform administrator.`,
      orderId: order.id,
    });
  }
  return orders.rows.length;
};

// Locks the Pending orders that hold the given products, in ascending id. A path that starts
// from products (expiry, moderation) calls this before it locks the products, so it cannot
// deadlock with a store's decision (order first, then products).
export const lockOrdersHoldingProducts = async (client: PoolClient, productIds: number[]) => {
  if (productIds.length === 0) return [];
  const result = await client.query<OrderRow>(
    `SELECT orders.* FROM orders
     WHERE orders.status = 'Pending'
       AND orders.id IN (
         SELECT reservations.order_id FROM reservations
         WHERE reservations.product_id = ANY($1::int[]) AND reservations.status = 'Pending'
       )
     ORDER BY orders.id
     FOR UPDATE`,
    [productIds],
  );
  return result.rows;
};

export type DroppedCause = "EXPIRED" | "REMOVED";

const DROPPED_TEXT: Record<DroppedCause, { some: string; all: string }> = {
  EXPIRED: {
    some: "Some items of your order {code} were cancelled because the products expired.",
    all: "Your order {code} was cancelled because its products expired.",
  },
  REMOVED: {
    some: "Some items of your order {code} were removed by the platform administrator.",
    all: "Order {code} was cancelled by the platform administrator.",
  },
};

// Cancels the Pending items of the given products in the orders locked by
// lockOrdersHoldingProducts. An order whose restaurant did not accept partial fulfilment is
// cancelled whole; an order with nothing left is cancelled too (syncOrderStatus). The restaurant
// gets one notification per order. Returns how many orders were touched.
export const cancelPendingItemsOfProducts = async (
  client: PoolClient,
  orders: OrderRow[],
  productIds: number[],
  cause: DroppedCause,
  event: OrderEvent,
) => {
  for (const order of orders) {
    const dropped = await client.query<{ id: number }>(
      `UPDATE reservations SET status = 'Cancelled'
       WHERE reservations.order_id = $1 AND reservations.status = 'Pending'
         AND reservations.product_id = ANY($2::int[])
       RETURNING reservations.id`,
      [order.id, productIds],
    );
    // All or nothing: the rest of the order goes too.
    const rest = order.accept_partial ? [] : await moveItems(client, order.id, ["Pending"], "Cancelled");
    const updated = await syncOrderStatus(client, order.id, event);
    if (updated.status !== "Cancelled") {
      await recordItemChanges(
        client,
        order.id,
        [...dropped.rows, ...rest].map((item) => ({ id: item.id, from: "Pending", to: "Cancelled" })),
        event,
      );
    }
    const whole = updated.status === "Cancelled";
    const type =
      cause === "EXPIRED"
        ? whole
          ? "ORDER_EXPIRED"
          : "ORDER_ITEMS_EXPIRED"
        : whole
          ? "ORDER_CANCELLED_BY_ADMIN"
          : "ORDER_ITEMS_REMOVED";
    await createNotification(client, {
      userId: order.restaurant_id,
      type,
      message: DROPPED_TEXT[cause][whole ? "all" : "some"].replace("{code}", formatOrderCode(order.code)),
      orderId: order.id,
    });
  }
  return orders.length;
};
