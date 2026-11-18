import type { PoolClient } from "pg";
import { getDeliveryProvider } from "../delivery/config.js";
import { DeliveryError, type DeliveryLocation, type DeliveryProvider } from "../delivery/types.js";
import { createNotification } from "../utils/notifications.js";
import { formatOrderCode } from "./orders/codes.js";

// Creating the delivery when a store accepts a delivery order (delivery phase 2). It runs inside
// the decision's transaction, so the acceptance and the delivery are saved together and the
// acceptance email already has the final price. The provider is asked for a quote for the
// accepted goods first (the price, so the courier's cash amount is goods + price), then the
// delivery is created with the order as the idempotency key. Any failure is kept as a FAILED
// delivery (notifyDeliveryFailed tells both sides); the acceptance stands.
// Known limit: a real provider call inside the transaction holds the order's locks while it runs;
// before Korpa goes live this should move to an outbox (see docs/development-plan.md).

interface OrderForDelivery {
  id: number;
  code: string;
  store_id: number;
  restaurant_id: number;
}

interface PartyRow {
  business_name: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface OrderDeliveryRow {
  delivery_address: string;
  delivery_latitude: number;
  delivery_longitude: number;
  goods: string;
}

const money = (value: number) => value.toFixed(2);

// The local wall-clock time of an instant, as orders.pickup_at stores it.
const localTimestamp = async (client: PoolClient, iso: string) =>
  (
    await client.query<{ local: string }>(`SELECT to_char($1::timestamptz, 'YYYY-MM-DD"T"HH24:MI:SS') AS local`, [iso])
  ).rows[0]!.local;

export type DeliveryOutcome = { created: true; price: string } | { created: false; reason: string };

export const createOrderDelivery = async (
  client: PoolClient,
  order: OrderForDelivery,
  readyAt: Date,
  provider: DeliveryProvider = getDeliveryProvider(),
): Promise<DeliveryOutcome> => {
  const store = (
    await client.query<PartyRow>(
      `SELECT users.business_name, users.address, cities.name AS city, users.phone, users.latitude, users.longitude
       FROM users LEFT JOIN cities ON cities.id = users.city_id WHERE users.id = $1`,
      [order.store_id],
    )
  ).rows[0]!;
  const restaurant = (
    await client.query<{ business_name: string | null; phone: string | null; city: string | null }>(
      `SELECT users.business_name, users.phone, cities.name AS city
       FROM users LEFT JOIN cities ON cities.id = users.city_id WHERE users.id = $1`,
      [order.restaurant_id],
    )
  ).rows[0]!;
  // The address and pin the order kept, and the accepted goods at the agreed prices.
  const row = (
    await client.query<OrderDeliveryRow>(
      `SELECT orders.delivery_address, orders.delivery_latitude, orders.delivery_longitude,
              COALESCE((SELECT SUM(order_items.quantity * order_items.unit_price) FROM order_items
                        WHERE order_items.order_id = orders.id AND order_items.status = 'Confirmed'), 0)::text AS goods
       FROM orders WHERE orders.id = $1`,
      [order.id],
    )
  ).rows[0]!;

  const goods = Number(row.goods);
  // A store that removed its pin since the order was sent cannot be picked up from.
  let reason = "STORE_NO_LOCATION";
  try {
    if (store.latitude === null || store.longitude === null) return await recordFailure(client, order, provider, readyAt, reason);
    const pickup: DeliveryLocation = {
      name: store.business_name ?? "",
      address: store.address ?? "",
      city: store.city ?? "",
      latitude: store.latitude,
      longitude: store.longitude,
      phone: store.phone ?? "",
    };
    const dropoff: DeliveryLocation = {
      name: restaurant.business_name ?? "",
      // The address as the order kept it ("<address>, <city>"); the city for the contract.
      address: row.delivery_address,
      city: restaurant.city ?? "",
      latitude: row.delivery_latitude,
      longitude: row.delivery_longitude,
      phone: restaurant.phone ?? "",
    };
    const quote = await provider.quote({ pickup, dropoff, ready_at: readyAt.toISOString(), goods_amount: money(goods) });
    if (!quote.available) throw new DeliveryError(422, quote.code, quote.message);
    const delivery = await provider.createDelivery(
      {
        quote_id: quote.quote.quote_id,
        external_order_id: order.id,
        external_order_code: order.code,
        pickup,
        dropoff,
        ready_at: readyAt.toISOString(),
        goods_amount: money(goods),
        cash_to_collect: money(goods + Number(quote.quote.price)),
      },
      `order-${order.id}`,
    );
    await client.query(
      `INSERT INTO deliveries (order_id, provider, provider_delivery_id, status, price, cash_to_collect, ready_at,
         estimated_pickup_at, estimated_delivery_at, tracking_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        order.id,
        provider.name,
        delivery.delivery_id,
        delivery.status,
        delivery.price,
        money(goods + Number(delivery.price)),
        readyAt.toISOString(),
        delivery.estimated_pickup_at,
        delivery.estimated_delivery_at,
        delivery.tracking_url,
      ],
    );
    // The courier's pickup is the order's handover time from now on.
    await client.query(
      "UPDATE orders SET pickup_at = $2, delivery_estimated_at = $3 WHERE orders.id = $1",
      [order.id, await localTimestamp(client, delivery.estimated_pickup_at), delivery.estimated_delivery_at],
    );
    return { created: true, price: delivery.price };
  } catch (error) {
    if (!(error instanceof DeliveryError)) console.error(`Creating the delivery of order ${order.id} failed:`, error);
    reason = error instanceof DeliveryError ? error.code : "UNAVAILABLE";
  }
  return recordFailure(client, order, provider, readyAt, reason);
};

// Keeps a delivery that could not be created, with the reason.
const recordFailure = async (
  client: PoolClient,
  order: OrderForDelivery,
  provider: DeliveryProvider,
  readyAt: Date,
  reason: string,
): Promise<DeliveryOutcome> => {
  await client.query(
    `INSERT INTO deliveries (order_id, provider, status, ready_at, failure_reason)
     VALUES ($1, $2, 'FAILED', $3, $4)`,
    [order.id, provider.name, readyAt.toISOString(), reason],
  );
  return { created: false, reason };
};

// Tells both sides that no courier is coming (after the acceptance notification).
export const notifyDeliveryFailed = async (client: PoolClient, order: OrderForDelivery, reason: string) => {
  const code = formatOrderCode(order.code);
  for (const userId of [order.restaurant_id, order.store_id]) {
    await createNotification(client, {
      userId,
      orderId: order.id,
      type: "DELIVERY_FAILED",
      message: `The delivery of order ${code} could not be arranged.`,
      details: reason,
    });
  }
};

// The delivery of an order as the order actions need it (null for a pickup order never delivered).
export const findOrderDelivery = async (client: PoolClient, orderId: number) =>
  (
    await client.query<{ id: number; status: string; provider: string; provider_delivery_id: string | null; picked_up_at: string | null }>(
      `SELECT deliveries.id, deliveries.status, deliveries.provider, deliveries.provider_delivery_id, deliveries.picked_up_at
       FROM deliveries WHERE deliveries.order_id = $1 FOR UPDATE`,
      [orderId],
    )
  ).rows[0] ?? null;

// No courier is coming and the goods are still at the store: the delivery could not be created,
// failed, or the provider cancelled it before the pickup. The restaurant then chooses to pick the
// order up itself or to cancel it.
export const failedBeforePickup = (delivery: Awaited<ReturnType<typeof findOrderDelivery>>) =>
  delivery !== null && (delivery.status === "FAILED" || delivery.status === "CANCELLED") && delivery.picked_up_at === null;

// An admin cancels an order whose courier may still come: the delivery is cancelled with the
// provider first. A refusal (the courier already has the goods, or the provider is down) is logged
// and the delivery is closed on our side all the same; the admin resolves the rest by phone.
export const cancelOpenDelivery = async (
  client: PoolClient,
  orderId: number,
  reason: string,
  provider: DeliveryProvider = getDeliveryProvider(),
) => {
  const delivery = await findOrderDelivery(client, orderId);
  if (!delivery || !["CREATED", "COURIER_ASSIGNED"].includes(delivery.status)) return;
  try {
    await provider.cancelDelivery(delivery.provider_delivery_id!, reason);
  } catch (error) {
    console.error(`Cancelling the delivery of order ${orderId} with the provider failed:`, error);
  }
  await client.query("UPDATE deliveries SET status = 'CANCELLED', failure_reason = $2 WHERE deliveries.id = $1", [
    delivery.id,
    "CANCELLED_BY_ADMIN",
  ]);
};
