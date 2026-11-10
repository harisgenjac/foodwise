import type { PoolClient } from "pg";
import { HttpError } from "../../utils/httpError.js";
import { createNotification } from "../../utils/notifications.js";
import { releaseSoldProduct } from "../stock.js";
import { formatOrderCode } from "./codes.js";
import { lockOrder, moveItems, syncOrderStatus } from "./status.js";

// Actions on a whole order (docs/orders-design.md, section 2): the restaurant withdraws a Pending
// order, the store marks a Confirmed one picked up or cancels a missed pickup, an admin cancels
// either. There are no single-item cancels and no partial pickups. Each runs inside the caller's
// transaction and locks the order first.

const NOT_FOUND = "Order not found.";

// The products of items that were Confirmed and are now cancelled: a product they had sold out
// is offered again. Ascending id, after the order's lock.
const releaseProducts = async (client: PoolClient, productIds: number[]) => {
  for (const productId of [...new Set(productIds)].sort((a, b) => a - b)) {
    await releaseSoldProduct(client, productId);
  }
};

export const cancelOrder = async (client: PoolClient, restaurantId: number, orderId: number) => {
  const order = await lockOrder(client, orderId);
  if (!order || order.restaurant_id !== restaurantId) throw new HttpError(404, NOT_FOUND);
  if (order.status !== "Pending") {
    throw new HttpError(400, "Only pending orders can be cancelled.");
  }
  await moveItems(client, order.id, ["Pending"], "Cancelled");
  const updated = await syncOrderStatus(client, order.id, { source: "RESTAURANT", actorId: restaurantId });
  await createNotification(client, {
    userId: order.store_id,
    type: "ORDER_CANCELLED",
    message: `Order ${formatOrderCode(order.code)} was cancelled by the restaurant.`,
    orderId: order.id,
  });
  return updated;
};

// The store hands the food over. Allowed after the pickup time or the products' expiry too: the
// food was already promised to this restaurant.
export const completeOrder = async (client: PoolClient, storeId: number, orderId: number) => {
  const order = await lockOrder(client, orderId);
  if (!order || order.store_id !== storeId) throw new HttpError(404, NOT_FOUND);
  if (order.status !== "Confirmed") {
    throw new HttpError(400, "Only accepted orders can be marked as picked up.");
  }
  await moveItems(client, order.id, ["Confirmed"], "Completed", { pickedUp: true });
  await client.query("UPDATE orders SET picked_up_at = NOW() WHERE orders.id = $1", [order.id]);
  const updated = await syncOrderStatus(client, order.id, { source: "STORE", actorId: storeId });
  await createNotification(client, {
    userId: order.restaurant_id,
    type: "ORDER_COMPLETED",
    message: `Pickup of order ${formatOrderCode(order.code)} confirmed.`,
    orderId: order.id,
  });
  return updated;
};

// The restaurant did not come: the store cancels a Confirmed order whose pickup day has passed.
// The quantity goes back on offer. No credit is involved (restaurants pay none).
export const cancelOverdueOrder = async (client: PoolClient, storeId: number, orderId: number) => {
  const order = await lockOrder(client, orderId);
  if (!order || order.store_id !== storeId) throw new HttpError(404, NOT_FOUND);
  if (order.status !== "Confirmed" || !order.is_overdue) {
    throw new HttpError(400, "Only overdue pickups can be cancelled.");
  }
  const moved = await moveItems(client, order.id, ["Confirmed"], "Cancelled");
  await releaseProducts(client, moved.map((item) => item.product_id));
  const updated = await syncOrderStatus(client, order.id, { source: "STORE", actorId: storeId });
  await createNotification(client, {
    userId: order.restaurant_id,
    type: "ORDER_PICKUP_MISSED",
    message: `Your order ${formatOrderCode(order.code)} was cancelled because it was not picked up.`,
    orderId: order.id,
  });
  return updated;
};

// Resolves a dispute: a Pending or Confirmed order is cancelled and both sides are told why.
// The caller logs the admin action.
export const adminCancelOrder = async (client: PoolClient, adminId: number, orderId: number, reason: string) => {
  const order = await lockOrder(client, orderId);
  if (!order) throw new HttpError(404, NOT_FOUND);
  if (order.status !== "Pending" && order.status !== "Confirmed") {
    throw new HttpError(400, "Only pending or accepted orders can be cancelled.");
  }
  const moved = await moveItems(client, order.id, ["Pending", "Confirmed"], "Cancelled");
  if (order.status === "Confirmed") await releaseProducts(client, moved.map((item) => item.product_id));
  const updated = await syncOrderStatus(client, order.id, { source: "ADMIN", actorId: adminId, reason });
  for (const userId of [order.store_id, order.restaurant_id]) {
    await createNotification(client, {
      userId,
      type: "ORDER_CANCELLED_BY_ADMIN",
      message: `Order ${formatOrderCode(order.code)} was cancelled by the platform administrator.`,
      orderId: order.id,
      details: reason,
    });
  }
  return updated;
};
