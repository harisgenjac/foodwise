import type { PoolClient } from "pg";
import type { DeliveryEvent, DeliveryProvider, DeliveryStatus, WebhookHeaders } from "../delivery/types.js";
import { createNotification, type NotificationType } from "../utils/notifications.js";
import { inTransaction } from "../utils/transaction.js";
import { formatOrderCode, type OrderRow } from "./orders/codes.js";
import { lockOrder, moveItems, syncOrderStatus } from "./orders/status.js";

// The provider's status webhooks (delivery phase 2, src/delivery/openapi.yaml "deliveryEvent"):
// - courier assigned: the courier (the provider's id, name, phone, photo and vehicle), the time
//   (courier_assigned_at) and the tracking page are kept;
// - estimate updated: only the estimates move;
// - picked up: the courier has the goods, the order becomes InDelivery (source PROVIDER, no
//   notification: the order page shows it);
// - delivered: the order becomes Completed and both sides get DELIVERY_DELIVERED (a missed
//   "picked up" is applied first);
// - failed: before the pickup both sides get DELIVERY_FAILED and the order stays Confirmed until
//   the restaurant switches to pickup or cancels; after the pickup DELIVERY_FAILED_AFTER_PICKUP and
//   the order stays InDelivery (the goods left the store) until an admin cancels it;
// - cancelled by the provider (only before the pickup): like a failure before the pickup.
// A failure or cancellation stores its time in failed_at, its code in failure_code and the
// provider's text in failure_reason.
// Every applied event that carries estimates stores them on the delivery (and, before the pickup,
// the order's handover time); the event row keeps them too, so the delivery's history shows every
// estimate change. Every event is stored in delivery_events in the same transaction, so a repeated
// event_id is ignored, and an event that would move the delivery backwards (out of order, or after
// it closed) is stored but changes nothing.

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

// The courier and the tracking page as the event reports them (an event without them keeps ours).
const setCourier = async (client: PoolClient, deliveryId: number, event: DeliveryEvent) => {
  const { courier } = event;
  if (courier) {
    await client.query(
      `UPDATE deliveries SET courier_id = $2, courier_name = $3, courier_phone = $4, courier_photo_url = $5,
         courier_vehicle = $6
       WHERE deliveries.id = $1`,
      [deliveryId, courier.id, courier.name, courier.phone, courier.photo_url, courier.vehicle],
    );
  }
  if (event.tracking_url !== null) {
    await client.query("UPDATE deliveries SET tracking_url = $2 WHERE deliveries.id = $1", [deliveryId, event.tracking_url]);
  }
};

// The provider's new estimates. Before the pickup the courier's arrival at the store is also the
// order's handover time (orders.pickup_at, local time, as at acceptance); the arrival at the
// restaurant is the order's delivery_estimated_at.
const setEstimates = async (client: PoolClient, order: OrderRow, delivery: DeliveryRow, event: DeliveryEvent) => {
  const pickupAt = event.estimated_pickup_at;
  const deliveryAt = event.estimated_delivery_at;
  if (pickupAt === null && deliveryAt === null) return;
  await client.query(
    `UPDATE deliveries SET estimated_pickup_at = COALESCE($2, deliveries.estimated_pickup_at),
       estimated_delivery_at = COALESCE($3, deliveries.estimated_delivery_at)
     WHERE deliveries.id = $1`,
    [delivery.id, pickupAt, deliveryAt],
  );
  if (order.fulfilment_method !== "DELIVERY" || order.status !== "Confirmed") return;
  await client.query(
    `UPDATE orders SET
       pickup_at = CASE WHEN $2::timestamptz IS NULL OR NOT $4 THEN orders.pickup_at
                        ELSE ($2::timestamptz AT TIME ZONE current_setting('TimeZone')) END,
       delivery_estimated_at = COALESCE($3, orders.delivery_estimated_at)
     WHERE orders.id = $1`,
    [order.id, pickupAt, deliveryAt, BEFORE_PICKUP.includes(delivery.status)],
  );
};

// The courier has the goods: a Confirmed delivery order becomes InDelivery. An order that is no
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

const markFailed = (client: PoolClient, delivery: DeliveryRow, status: "FAILED" | "CANCELLED", event: DeliveryEvent) =>
  client.query(
    `UPDATE deliveries SET status = $2, failure_code = $3, failure_reason = $4, failed_at = $5
     WHERE deliveries.id = $1`,
    [delivery.id, status, event.failure_code, event.failure_reason ?? event.failure_code, event.occurred_at],
  );

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
      await client.query(
        `UPDATE deliveries SET status = 'COURIER_ASSIGNED', courier_assigned_at = COALESCE(deliveries.courier_assigned_at, $2)
         WHERE deliveries.id = $1`,
        [delivery.id, event.occurred_at],
      );
      await setCourier(client, delivery.id, event);
      return true;
    case "delivery.estimate_updated":
      return OPEN.includes(delivery.status);
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
      await markFailed(client, delivery, "FAILED", event);
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
      await markFailed(client, delivery, "CANCELLED", event);
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
    `INSERT INTO delivery_events (delivery_id, provider, event_id, type, occurred_at, applied,
       estimated_pickup_at, estimated_delivery_at, failure_code)
     VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING delivery_events.id`,
    [
      delivery.id,
      providerName,
      event.event_id,
      event.type,
      event.occurred_at,
      event.estimated_pickup_at,
      event.estimated_delivery_at,
      event.failure_code,
    ],
  );
  if (stored.rowCount === 0) return "DUPLICATE";

  const applied = await applyEvent(client, order, delivery, event);
  if (!applied) return "IGNORED";
  // The estimates with the delivery's status before the event (the order's handover time moves
  // only before the pickup) and the order as it was locked.
  await setEstimates(client, order, delivery, event);
  await client.query("UPDATE delivery_events SET applied = true WHERE delivery_events.id = $1", [stored.rows[0].id]);
  return "APPLIED";
};
