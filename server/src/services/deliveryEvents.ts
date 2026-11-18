import type { PoolClient } from "pg";
import type { DeliveryEvent, DeliveryProvider, DeliveryStatus, WebhookHeaders } from "../delivery/types.js";
import { createNotification, type NotificationType } from "../utils/notifications.js";
import { inTransaction } from "../utils/transaction.js";
import { formatOrderCode, type OrderRow } from "./orders/codes.js";
import { lockOrder, moveItems, syncOrderStatus } from "./orders/status.js";

// The provider's status webhooks (delivery phase 2, src/delivery/openapi.yaml "deliveryEvent"):
// - courier assigned: the courier's name and phone are kept;
// - picked up: the courier has the goods, the order becomes InDelivery (source PROVIDER, no
//   notification: the order page shows it);
// - delivered: the order becomes Completed and both sides get DELIVERY_DELIVERED (a missed
//   "picked up" is applied first);
// - failed: before the pickup both sides get DELIVERY_FAILED and the order stays Confirmed until
//   the restaurant switches to pickup or cancels; after the pickup DELIVERY_FAILED_AFTER_PICKUP and
//   the order stays InDelivery (the goods left the store) until an admin cancels it;
// - cancelled by the provider (only before the pickup): like a failure before the pickup.
// Every event is stored in delivery_events in the same transaction, so a repeated event_id is
// ignored, and an event that would move the delivery backwards (out of order, or after it
// closed) is stored but changes nothing.

type WebhookOutcome = "APPLIED" | "IGNORED" | "DUPLICATE" | "UNKNOWN_DELIVERY";

interface DeliveryRow {
  id: number;
  order_id: number;
  status: DeliveryStatus;
}

const BEFORE_PICKUP: DeliveryStatus[] = ["CREATED", "COURIER_ASSIGNED"];
const OPEN: DeliveryStatus[] = [...BEFORE_PICKUP, "PICKED_UP"];

// Checks the signature and the body (DeliveryError otherwise), then applies the event.
export const receiveDeliveryWebhook = (
  provider: DeliveryProvider,
  rawBody: string,
  headers: WebhookHeaders,
): Promise<WebhookOutcome> => {
  const event = provider.parseWebhook(rawBody, headers);
  return inTransaction((client) => applyDeliveryEvent(client, provider.name, event));
};

const notifyBoth = async (client: PoolClient, order: OrderRow, type: NotificationType, message: string) => {
  for (const userId of [order.restaurant_id, order.store_id]) {
    await createNotification(client, { userId, orderId: order.id, type, message });
  }
};

const setCourier = (client: PoolClient, deliveryId: number, event: DeliveryEvent) =>
  event.courier
    ? client.query("UPDATE deliveries SET courier_name = $2, courier_phone = $3 WHERE deliveries.id = $1", [
        deliveryId,
        event.courier.name,
        event.courier.phone,
      ])
    : null;

// The courier has the goods: a Confirmed delivery order becomes Completed. An order that is no
// longer Confirmed (an admin cancelled it meanwhile) only gets the delivery's status.
const markPickedUp = async (client: PoolClient, order: OrderRow, delivery: DeliveryRow, event: DeliveryEvent) => {
  await client.query("UPDATE deliveries SET status = 'PICKED_UP', picked_up_at = $2 WHERE deliveries.id = $1", [
    delivery.id,
    event.occurred_at,
  ]);
  if (order.status !== "Confirmed" || order.fulfilment_method !== "DELIVERY") return;
  // picked_up_at: when the goods left the store (the reports and the store's pickup history).
  await moveItems(client, order.id, ["Confirmed"], "InDelivery", { pickedUp: true });
  await client.query("UPDATE orders SET picked_up_at = NOW() WHERE orders.id = $1", [order.id]);
  await syncOrderStatus(client, order.id, { source: "PROVIDER" });
};

// The courier delivered: the order is Completed (the statistics count it from now on).
const markDelivered = async (client: PoolClient, orderId: number) => {
  await moveItems(client, orderId, ["InDelivery"], "Completed");
  await syncOrderStatus(client, orderId, { source: "PROVIDER" });
};

// Applies one event; false when it would move the delivery backwards.
const applyEvent = async (
  client: PoolClient,
  order: OrderRow,
  delivery: DeliveryRow,
  event: DeliveryEvent,
): Promise<boolean> => {
  const code = formatOrderCode(order.code);
  // A cancelled order's sides are not told about its courier any more.
  const notify = order.status !== "Cancelled";
  switch (event.type) {
    case "delivery.courier_assigned":
      if (!BEFORE_PICKUP.includes(delivery.status)) return false;
      await client.query("UPDATE deliveries SET status = 'COURIER_ASSIGNED' WHERE deliveries.id = $1", [delivery.id]);
      await setCourier(client, delivery.id, event);
      return true;
    case "delivery.picked_up":
      if (!BEFORE_PICKUP.includes(delivery.status)) return false;
      await setCourier(client, delivery.id, event);
      await markPickedUp(client, order, delivery, event);
      return true;
    case "delivery.delivered":
      if (!OPEN.includes(delivery.status)) return false;
      await setCourier(client, delivery.id, event);
      if (delivery.status !== "PICKED_UP") await markPickedUp(client, order, delivery, event);
      await client.query("UPDATE deliveries SET status = 'DELIVERED', delivered_at = $2 WHERE deliveries.id = $1", [
        delivery.id,
        event.occurred_at,
      ]);
      await markDelivered(client, order.id);
      if (notify) await notifyBoth(client, order, "DELIVERY_DELIVERED", `Order ${code} was delivered.`);
      return true;
    case "delivery.failed": {
      if (!OPEN.includes(delivery.status)) return false;
      await client.query("UPDATE deliveries SET status = 'FAILED', failure_reason = $2 WHERE deliveries.id = $1", [
        delivery.id,
        event.failure_reason,
      ]);
      if (!notify) return true;
      if (delivery.status === "PICKED_UP") {
        await notifyBoth(
          client,
          order,
          "DELIVERY_FAILED_AFTER_PICKUP",
          `Order ${code} was picked up by the courier but could not be delivered.`,
        );
      } else {
        await notifyBoth(client, order, "DELIVERY_FAILED", `The delivery of order ${code} failed.`);
      }
      return true;
    }
    case "delivery.cancelled":
      if (!BEFORE_PICKUP.includes(delivery.status)) return false;
      await client.query("UPDATE deliveries SET status = 'CANCELLED', failure_reason = $2 WHERE deliveries.id = $1", [
        delivery.id,
        event.failure_reason ?? "CANCELLED_BY_PROVIDER",
      ]);
      if (notify) await notifyBoth(client, order, "DELIVERY_FAILED", `The delivery of order ${code} was cancelled.`);
      return true;
  }
};

const applyDeliveryEvent = async (
  client: PoolClient,
  providerName: string,
  event: DeliveryEvent,
): Promise<WebhookOutcome> => {
  const found = await client.query<{ id: number; order_id: number }>(
    `SELECT deliveries.id, deliveries.order_id FROM deliveries
     WHERE deliveries.provider = $1 AND deliveries.provider_delivery_id = $2`,
    [providerName, event.delivery_id],
  );
  const ref = found.rows[0];
  // Answered with 200 all the same: a retry would never find it either.
  if (!ref || ref.order_id !== event.external_order_id) {
    console.warn(`Delivery webhook ${event.event_id} for an unknown delivery ${event.delivery_id} was ignored.`);
    return "UNKNOWN_DELIVERY";
  }
  // The order first, as on every order path; this also serialises events of one delivery.
  const order = (await lockOrder(client, ref.order_id))!;
  const delivery = (
    await client.query<DeliveryRow>(
      "SELECT deliveries.id, deliveries.order_id, deliveries.status FROM deliveries WHERE deliveries.id = $1 FOR UPDATE",
      [ref.id],
    )
  ).rows[0]!;
  const stored = await client.query(
    `INSERT INTO delivery_events (delivery_id, provider, event_id, type, occurred_at, applied)
     VALUES ($1, $2, $3, $4, $5, false)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING delivery_events.id`,
    [delivery.id, providerName, event.event_id, event.type, event.occurred_at],
  );
  if (stored.rowCount === 0) return "DUPLICATE";

  const applied = await applyEvent(client, order, delivery, event);
  if (!applied) return "IGNORED";
  await client.query("UPDATE delivery_events SET applied = true WHERE delivery_events.id = $1", [stored.rows[0].id]);
  return "APPLIED";
};
