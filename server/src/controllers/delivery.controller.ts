import type { Request, Response } from "express";
import pool from "../config/db.js";
import { getDeliveryProvider } from "../delivery/config.js";
import { MockProvider, type SimulateOptions } from "../delivery/mock.js";
import {
  DELIVERY_FAILURE_CODES,
  DeliveryError,
  type CourierVehicle,
  type Delivery,
  type DeliveryEventType,
  type DeliveryFailureCode,
  type DeliveryStatus,
} from "../delivery/types.js";
import { receiveDeliveryWebhook } from "../services/deliveryEvents.js";
import { getOrderDetails } from "../services/orders/queries.js";
import { parseId } from "../utils/params.js";

// POST /api/delivery/webhooks/:provider (no login: the provider's signature is the proof). The
// body arrives raw (express.raw in app.ts), because the signature covers the exact bytes. 200 for
// a processed event, also a repeated, out-of-order or unknown one (a retry would not change it);
// 401 for the signature and 400 for the body, with the contract's code.
export const deliveryWebhook = async (req: Request, res: Response) => {
  const provider = getDeliveryProvider();
  if (req.params.provider !== provider.name) {
    return res.status(404).json({ error: "Unknown delivery provider." });
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  try {
    const outcome = await receiveDeliveryWebhook(provider, rawBody, req.headers);
    return res.status(200).json({ message: "Webhook received.", outcome });
  } catch (error) {
    if (error instanceof DeliveryError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error("Error while processing a delivery webhook:", error);
    return res.status(500).json({ error: "An error occurred while processing the webhook." });
  }
};

// The dev courier's steps (body `{ event }`), as the mock's webhook types. `estimate` moves the
// arrival by `minutes`.
const COURIER_STEPS: Record<string, DeliveryEventType> = {
  courier_assigned: "delivery.courier_assigned",
  estimate: "delivery.estimate_updated",
  picked_up: "delivery.picked_up",
  delivered: "delivery.delivered",
  failed: "delivery.failed",
  cancelled: "delivery.cancelled",
};

const STEP_ERROR = "This courier step is not valid.";

// The step's options from the body: `photo` (a boolean) for an assignment, `failure_code` for a
// failure, `minutes` (a whole number, not 0, at most 120 either way) for an estimate. Null when
// one is not valid.
const parseStepOptions = (step: DeliveryEventType, body: Record<string, unknown>): SimulateOptions | null => {
  const options: SimulateOptions = {};
  if (step === "delivery.courier_assigned" && body.photo !== undefined) {
    if (typeof body.photo !== "boolean") return null;
    options.photo = body.photo;
  }
  if (step === "delivery.failed" && body.failure_code !== undefined) {
    if (!(DELIVERY_FAILURE_CODES as readonly unknown[]).includes(body.failure_code)) return null;
    options.failureCode = body.failure_code as DeliveryFailureCode;
  }
  if (step === "delivery.estimate_updated") {
    const minutes = body.minutes;
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes === 0 || Math.abs(minutes) > 120) {
      return null;
    }
    options.minutes = minutes;
  }
  return options;
};

interface SimulatedRow {
  store_id: number;
  restaurant_id: number;
  provider: string | null;
  provider_delivery_id: string | null;
  status: DeliveryStatus | null;
  price: string | null;
  ready_at: Date | null;
  estimated_pickup_at: Date | null;
  estimated_delivery_at: Date | null;
  courier_id: string | null;
  courier_name: string | null;
  courier_phone: string | null;
  courier_photo_url: string | null;
  courier_vehicle: CourierVehicle | null;
  courier_assigned_at: Date | null;
  failure_code: DeliveryFailureCode | null;
  failure_reason: string | null;
  tracking_url: string | null;
}

// The mock forgets its deliveries on a restart (node --watch restarts on every build); our row
// gives it back the delivery as we know it.
const asMockDelivery = (orderId: number, row: SimulatedRow): Delivery => ({
  delivery_id: row.provider_delivery_id!,
  external_order_id: orderId,
  status: row.status!,
  price: row.price!,
  currency: "BAM",
  ready_at: row.ready_at!.toISOString(),
  estimated_pickup_at: row.estimated_pickup_at!.toISOString(),
  estimated_delivery_at: row.estimated_delivery_at!.toISOString(),
  courier:
    row.courier_name && row.courier_phone
      ? {
          id: row.courier_id ?? "mock_courier_unknown",
          name: row.courier_name,
          phone: row.courier_phone,
          photo_url: row.courier_photo_url,
          vehicle: row.courier_vehicle,
        }
      : null,
  courier_assigned_at: row.courier_assigned_at?.toISOString() ?? null,
  failure_code: row.failure_code,
  failure_reason: row.failure_reason,
  tracking_url: row.tracking_url,
});

// POST /api/delivery/mock/orders/:id/simulate (development only, with the mock provider): plays
// the courier for an order's delivery. The mock signs the webhook it would send and it goes
// through the same path as a real one. Either party of the order may use it.
export const simulateCourier = async (req: Request, res: Response) => {
  const provider = getDeliveryProvider();
  if (!(provider instanceof MockProvider)) return res.status(404).json({ error: "Route not found." });
  const orderId = parseId(req.params.id);
  if (orderId === null) return res.status(404).json({ error: "Order not found." });
  const step = typeof req.body.event === "string" && Object.hasOwn(COURIER_STEPS, req.body.event)
    ? COURIER_STEPS[req.body.event]!
    : null;
  const options = step === null ? null : parseStepOptions(step, req.body);
  if (step === null || options === null) return res.status(400).json({ error: STEP_ERROR });

  try {
    const row = (
      await pool.query<SimulatedRow>(
        `SELECT orders.store_id, orders.restaurant_id, deliveries.provider, deliveries.provider_delivery_id,
                deliveries.status, deliveries.price::text AS price, deliveries.ready_at, deliveries.estimated_pickup_at,
                deliveries.estimated_delivery_at, deliveries.courier_id, deliveries.courier_name,
                deliveries.courier_phone, deliveries.courier_photo_url, deliveries.courier_vehicle,
                deliveries.courier_assigned_at, deliveries.failure_code, deliveries.failure_reason,
                deliveries.tracking_url
         FROM orders LEFT JOIN deliveries ON deliveries.order_id = orders.id
         WHERE orders.id = $1`,
        [orderId],
      )
    ).rows[0];
    const userId = req.user!.id;
    if (!row || (row.store_id !== userId && row.restaurant_id !== userId)) {
      return res.status(404).json({ error: "Order not found." });
    }
    if (row.provider !== provider.name || row.provider_delivery_id === null) {
      return res.status(409).json({ error: "This order has no delivery to simulate." });
    }
    if (!provider.has(row.provider_delivery_id)) provider.remember(asMockDelivery(orderId, row));
    const webhook = provider.simulate(row.provider_delivery_id, step, options);
    await receiveDeliveryWebhook(provider, webhook.rawBody, webhook.headers);
    const order = await getOrderDetails(orderId, userId);
    return res.status(200).json({ message: "Courier step simulated.", order });
  } catch (error) {
    if (error instanceof DeliveryError && error.code === "INVALID_TRANSITION") {
      return res.status(409).json({ error: "This courier step is not possible now." });
    }
    console.error("Error while simulating the courier:", error);
    return res.status(500).json({ error: "An error occurred while simulating the courier." });
  }
};

// GET /api/delivery/mock/deliveries/:deliveryId (development only): what the provider's tracking
// page would show for a mock delivery (the dev page /dev/tracking/:deliveryId, the mock's
// tracking_url): the courier, the status, the estimates, the history of the delivery's events
// with the estimates each one carried, and the ratings the provider received. For the order's two
// parties and admins.
export const getMockTracking = async (req: Request, res: Response) => {
  const provider = getDeliveryProvider();
  if (!(provider instanceof MockProvider)) return res.status(404).json({ error: "Route not found." });
  const deliveryId = typeof req.params.deliveryId === "string" ? req.params.deliveryId : "";
  try {
    const delivery = (
      await pool.query(
        `SELECT deliveries.id, deliveries.provider_delivery_id AS delivery_id, deliveries.order_id,
                orders.code AS order_code, orders.store_id, orders.restaurant_id, orders.delivery_address,
                stores.business_name AS store_name, restaurants.business_name AS restaurant_name,
                deliveries.status, deliveries.ready_at, deliveries.estimated_pickup_at, deliveries.estimated_delivery_at,
                deliveries.courier_name, deliveries.courier_phone, deliveries.courier_photo_url,
                deliveries.courier_vehicle, deliveries.courier_assigned_at, deliveries.picked_up_at,
                deliveries.delivered_at, deliveries.failed_at, deliveries.failure_code, deliveries.failure_reason,
                deliveries.tracking_url
         FROM deliveries
         JOIN orders ON orders.id = deliveries.order_id
         JOIN users AS stores ON stores.id = orders.store_id
         JOIN users AS restaurants ON restaurants.id = orders.restaurant_id
         WHERE deliveries.provider = $1 AND deliveries.provider_delivery_id = $2`,
        [provider.name, deliveryId],
      )
    ).rows[0];
    const user = req.user!;
    if (!delivery || (user.role !== "ADMIN" && delivery.store_id !== user.id && delivery.restaurant_id !== user.id)) {
      return res.status(404).json({ error: "Delivery not found." });
    }
    const history = await pool.query(
      `SELECT delivery_events.id, delivery_events.type, delivery_events.occurred_at, delivery_events.applied,
              delivery_events.estimated_pickup_at, delivery_events.estimated_delivery_at, delivery_events.failure_code
       FROM delivery_events
       WHERE delivery_events.delivery_id = $1
       ORDER BY delivery_events.occurred_at, delivery_events.id`,
      [delivery.id],
    );
    // What the mock received; after a restart (it forgets) the ratings we know it received.
    let ratings: { rating: number; comment: string | null; received_at: string | Date }[] =
      provider.ratingsFor(deliveryId);
    if (ratings.length === 0) {
      ratings = (
        await pool.query(
          `SELECT courier_ratings.rating, courier_ratings.comment, courier_ratings.sent_at AS received_at
           FROM courier_ratings
           WHERE courier_ratings.delivery_id = $1 AND courier_ratings.sent_at IS NOT NULL`,
          [delivery.id],
        )
      ).rows;
    }
    const { id: _id, store_id: _store, restaurant_id: _restaurant, ...visible } = delivery;
    return res.status(200).json({ message: "Delivery fetched successfully.", delivery: visible, history: history.rows, ratings });
  } catch (error) {
    console.error("Error while fetching the mock delivery:", error);
    return res.status(500).json({ error: "An error occurred while fetching the delivery." });
  }
};
