import type { Request, Response } from "express";
import pool from "../config/db.js";
import { getDeliveryProvider } from "../delivery/config.js";
import { MockProvider } from "../delivery/mock.js";
import { DeliveryError, type Delivery, type DeliveryEventType, type DeliveryStatus } from "../delivery/types.js";
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

// The dev courier's steps (body `{ event }`), as the mock's webhook types.
const COURIER_STEPS: Record<string, DeliveryEventType> = {
  courier_assigned: "delivery.courier_assigned",
  picked_up: "delivery.picked_up",
  delivered: "delivery.delivered",
  failed: "delivery.failed",
  cancelled: "delivery.cancelled",
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
  courier_name: string | null;
  courier_phone: string | null;
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
  courier: row.courier_name && row.courier_phone ? { name: row.courier_name, phone: row.courier_phone } : null,
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
  if (step === null) return res.status(400).json({ error: "This courier step is not valid." });

  try {
    const row = (
      await pool.query<SimulatedRow>(
        `SELECT orders.store_id, orders.restaurant_id, deliveries.provider, deliveries.provider_delivery_id,
                deliveries.status, deliveries.price::text AS price, deliveries.ready_at, deliveries.estimated_pickup_at,
                deliveries.estimated_delivery_at, deliveries.courier_name, deliveries.courier_phone,
                deliveries.failure_reason, deliveries.tracking_url
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
    const webhook = provider.simulate(row.provider_delivery_id, step);
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
