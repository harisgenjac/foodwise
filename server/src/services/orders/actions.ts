import type { PoolClient } from "pg";
import { isValidDateTime } from "../../utils/dates.js";
import { HttpError } from "../../utils/httpError.js";
import { createNotification } from "../../utils/notifications.js";
import { cancelOpenDelivery, failedBeforePickup, findOrderDelivery } from "../orderDelivery.js";
import { releaseSoldProduct } from "../stock.js";
import { formatOrderCode } from "./codes.js";
import { lockOrder, lockOrderItems, moveItems, syncOrderStatus } from "./status.js";

// Actions on a whole order (docs/product.md): the restaurant withdraws a Pending
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
// food was already promised to this restaurant. A delivery order is completed by the courier's
// delivery (the provider's webhook), never by the store.
export const completeOrder = async (client: PoolClient, storeId: number, orderId: number) => {
  const order = await lockOrder(client, orderId);
  if (!order || order.store_id !== storeId) throw new HttpError(404, NOT_FOUND);
  if (order.status !== "Confirmed") {
    throw new HttpError(400, "Only accepted orders can be marked as picked up.");
  }
  if (order.fulfilment_method === "DELIVERY") {
    throw new HttpError(400, "A delivery order is completed when the courier delivers it.");
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

// Resolves a dispute: a Pending, Confirmed or InDelivery order is cancelled and both sides are told
// why. The caller logs the admin action. An InDelivery order (the courier has the goods, e.g. a
// delivery that failed after the pickup) does not put its quantity back on offer: the goods left
// the store, so the products' quantity is lowered by what the courier took.
export const adminCancelOrder = async (client: PoolClient, adminId: number, orderId: number, reason: string) => {
  const order = await lockOrder(client, orderId);
  if (!order) throw new HttpError(404, NOT_FOUND);
  if (order.status !== "Pending" && order.status !== "Confirmed" && order.status !== "InDelivery") {
    throw new HttpError(400, "Only pending, accepted or in-delivery orders can be cancelled.");
  }
  if (order.status === "InDelivery") {
    const items = await lockOrderItems(client, order.id);
    for (const item of items.filter((entry) => entry.status === "InDelivery")) {
      await client.query("UPDATE products SET quantity = GREATEST(products.quantity - $2, 0) WHERE products.id = $1", [
        item.product_id,
        item.quantity,
      ]);
    }
  }
  const moved = await moveItems(client, order.id, ["Pending", "Confirmed", "InDelivery"], "Cancelled");
  if (order.status === "Confirmed") await releaseProducts(client, moved.map((item) => item.product_id));
  if (order.fulfilment_method === "DELIVERY") await cancelOpenDelivery(client, order.id, reason);
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

// After a failed delivery (see failedBeforePickup) the restaurant chooses what happens to its
// accepted order: it picks the order up itself at the store, or cancels it.
const lockFailedDelivery = async (client: PoolClient, restaurantId: number, orderId: number, refusal: string) => {
  const order = await lockOrder(client, orderId);
  if (!order || order.restaurant_id !== restaurantId) throw new HttpError(404, NOT_FOUND);
  const delivery = order.fulfilment_method === "DELIVERY" ? await findOrderDelivery(client, order.id) : null;
  if (order.status !== "Confirmed" || !failedBeforePickup(delivery)) throw new HttpError(400, refusal);
  return order;
};

// The order becomes a pickup order at the time the restaurant chose (today up to the earliest
// expiry of its accepted products, as when sending). The failed delivery stays as its history.
export const switchToPickup = async (client: PoolClient, restaurantId: number, orderId: number, pickupAt: unknown) => {
  const order = await lockFailedDelivery(
    client,
    restaurantId,
    orderId,
    "Only an accepted order whose delivery failed can be switched to pickup.",
  );
  if (!isValidDateTime(pickupAt)) throw new HttpError(400, "Pickup date is not valid.");
  const range = await client.query<{ in_range: boolean }>(
    `SELECT $2::timestamp::date >= CURRENT_DATE
            AND $2::timestamp::date <= (
              SELECT MIN(products.expiry_date) FROM order_items
              JOIN products ON products.id = order_items.product_id
              WHERE order_items.order_id = $1 AND order_items.status = 'Confirmed'
            ) AS in_range`,
    [order.id, pickupAt],
  );
  if (!range.rows[0]!.in_range) {
    throw new HttpError(400, "Pickup date must be between today and the products' expiry date.");
  }
  await client.query("UPDATE orders SET fulfilment_method = 'PICKUP', pickup_at = $2, switched_to_pickup_at = NOW() WHERE orders.id = $1", [
    order.id,
    pickupAt,
  ]);
  await createNotification(client, {
    userId: order.store_id,
    type: "ORDER_SWITCHED_TO_PICKUP",
    message: `Order ${formatOrderCode(order.code)} will be picked up by the restaurant instead of delivered.`,
    orderId: order.id,
  });
  return (await lockOrder(client, order.id))!;
};

// The accepted items are cancelled and their quantity goes back on offer.
export const cancelFailedDelivery = async (client: PoolClient, restaurantId: number, orderId: number) => {
  const order = await lockFailedDelivery(
    client,
    restaurantId,
    orderId,
    "Only an accepted order whose delivery failed can be cancelled.",
  );
  const moved = await moveItems(client, order.id, ["Confirmed"], "Cancelled");
  await releaseProducts(client, moved.map((item) => item.product_id));
  const updated = await syncOrderStatus(client, order.id, { source: "RESTAURANT", actorId: restaurantId });
  await createNotification(client, {
    userId: order.store_id,
    type: "ORDER_CANCELLED_DELIVERY_FAILED",
    message: `Order ${formatOrderCode(order.code)} was cancelled by the restaurant after the delivery failed.`,
    orderId: order.id,
  });
  return updated;
};
