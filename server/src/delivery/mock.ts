import { randomUUID } from "node:crypto";
import {
  assertLocation,
  formatMoney,
  parseDeliveryEvent,
  requireDateTime,
  requireMoney,
} from "./contract.js";
import { haversineKm } from "./distance.js";
import { signWebhook, verifyWebhook } from "./signature.js";
import {
  DeliveryError,
  type Courier,
  type CreateDeliveryRequest,
  type Delivery,
  type DeliveryEvent,
  type DeliveryEventType,
  type DeliveryProvider,
  type DeliveryStatus,
  type Quote,
  type QuoteRequest,
  type QuoteResult,
  type SignedWebhook,
  type WebhookHeaders,
} from "./types.js";

// A delivery provider without a network, for development, tests and e2e: it follows the contract
// (docs/delivery-api.yaml) with fixed, predictable rules. State lives in memory, so a server
// restart forgets its deliveries. `simulate` plays the courier: it moves a delivery to the next
// status and returns the signed webhook the real provider would send.

export const MOCK_RULES = {
  baseCents: 300,
  centsPerKm: 70,
  // Prices are rounded to 10 fening.
  roundToCents: 10,
  maxKm: 25,
  // The courier arrives at the store this long after the goods are ready (or after now).
  pickupDelayMinutes: 5,
  minutesPerKm: 3,
  handoverMinutes: 5,
  quoteValidMinutes: 10,
} as const;

export const MOCK_COURIER: Courier = { name: "Mock Kurir", phone: "+38761000000" };

const MINUTE = 60_000;

// The status a webhook moves a delivery to, and the statuses it may come from.
const TRANSITIONS: Record<DeliveryEventType, { to: DeliveryStatus; from: DeliveryStatus[] }> = {
  "delivery.courier_assigned": { to: "COURIER_ASSIGNED", from: ["CREATED"] },
  "delivery.picked_up": { to: "PICKED_UP", from: ["COURIER_ASSIGNED"] },
  "delivery.delivered": { to: "DELIVERED", from: ["PICKED_UP"] },
  "delivery.failed": { to: "FAILED", from: ["CREATED", "COURIER_ASSIGNED", "PICKED_UP"] },
  "delivery.cancelled": { to: "CANCELLED", from: ["CREATED", "COURIER_ASSIGNED"] },
};

interface StoredQuote {
  quote: Quote;
  priceCents: number;
}

export interface MockProviderOptions {
  webhookSecret: string;
  now?: () => Date;
}

export interface SimulateOptions {
  courier?: Courier;
  failureReason?: string;
}

export class MockProvider implements DeliveryProvider {
  readonly name = "mock" as const;
  private readonly webhookSecret: string;
  private readonly now: () => Date;
  private readonly quotes = new Map<string, StoredQuote>();
  private readonly deliveries = new Map<string, Delivery>();
  private readonly byIdempotencyKey = new Map<string, string>();

  constructor(options: MockProviderOptions) {
    this.webhookSecret = options.webhookSecret;
    this.now = options.now ?? (() => new Date());
  }

  // Price and times for a route, or null outside the zone.
  private estimate(request: QuoteRequest) {
    assertLocation(request.pickup, "pickup");
    assertLocation(request.dropoff, "dropoff");
    const readyAt = requireDateTime(request.ready_at, "ready time");
    requireMoney(request.goods_amount, "goods amount");

    const km = haversineKm(request.pickup, request.dropoff);
    if (km > MOCK_RULES.maxKm) return null;
    const rawCents = MOCK_RULES.baseCents + MOCK_RULES.centsPerKm * km;
    const priceCents = Math.round(rawCents / MOCK_RULES.roundToCents) * MOCK_RULES.roundToCents;
    const start = Math.max(readyAt.getTime(), this.now().getTime());
    const pickupAt = new Date(start + MOCK_RULES.pickupDelayMinutes * MINUTE);
    const travelMinutes = Math.round(km * MOCK_RULES.minutesPerKm) + MOCK_RULES.handoverMinutes;
    const deliveryAt = new Date(pickupAt.getTime() + travelMinutes * MINUTE);
    return { priceCents, readyAt, pickupAt, deliveryAt };
  }

  async quote(request: QuoteRequest): Promise<QuoteResult> {
    const estimate = this.estimate(request);
    if (estimate === null) {
      return { available: false, code: "OUT_OF_ZONE", message: "The address is outside the delivery zone." };
    }
    const quote: Quote = {
      quote_id: `mock_q_${randomUUID()}`,
      price: formatMoney(estimate.priceCents),
      currency: "BAM",
      estimated_pickup_at: estimate.pickupAt.toISOString(),
      estimated_delivery_at: estimate.deliveryAt.toISOString(),
      expires_at: new Date(this.now().getTime() + MOCK_RULES.quoteValidMinutes * MINUTE).toISOString(),
    };
    this.quotes.set(quote.quote_id, { quote, priceCents: estimate.priceCents });
    return { available: true, quote };
  }

  async createDelivery(request: CreateDeliveryRequest, idempotencyKey: string): Promise<Delivery> {
    if (idempotencyKey.trim() === "") {
      throw new DeliveryError(400, "INVALID_REQUEST", "The Idempotency-Key header is required.");
    }
    const existing = this.byIdempotencyKey.get(idempotencyKey);
    if (existing !== undefined) return { ...this.deliveries.get(existing)! };

    const code = request.external_order_code;
    if (!Number.isSafeInteger(request.external_order_id) || typeof code !== "string" || code.trim() === "") {
      throw new DeliveryError(400, "INVALID_REQUEST", "The order reference is not valid.");
    }
    const estimate = this.estimate(request);
    if (estimate === null) {
      throw new DeliveryError(422, "OUT_OF_ZONE", "The address is outside the delivery zone.");
    }

    let priceCents = estimate.priceCents;
    if (request.quote_id !== undefined) {
      const stored = this.quotes.get(request.quote_id);
      if (!stored) throw new DeliveryError(404, "QUOTE_NOT_FOUND", "Quote not found.");
      if (new Date(stored.quote.expires_at).getTime() < this.now().getTime()) {
        throw new DeliveryError(409, "QUOTE_EXPIRED", "The quote has expired.");
      }
      priceCents = stored.priceCents;
    }
    const goodsCents = requireMoney(request.goods_amount, "goods amount");
    const cashCents = requireMoney(request.cash_to_collect, "cash to collect");
    if (cashCents !== goodsCents + priceCents) {
      throw new DeliveryError(
        400,
        "INVALID_REQUEST",
        "The cash to collect must equal the goods amount plus the delivery price.",
      );
    }

    const delivery: Delivery = {
      delivery_id: `mock_dlv_${randomUUID()}`,
      external_order_id: request.external_order_id,
      status: "CREATED",
      price: formatMoney(priceCents),
      currency: "BAM",
      ready_at: estimate.readyAt.toISOString(),
      estimated_pickup_at: estimate.pickupAt.toISOString(),
      estimated_delivery_at: estimate.deliveryAt.toISOString(),
      courier: null,
      failure_reason: null,
      tracking_url: null,
    };
    this.deliveries.set(delivery.delivery_id, delivery);
    this.byIdempotencyKey.set(idempotencyKey, delivery.delivery_id);
    return { ...delivery };
  }

  private find(deliveryId: string): Delivery {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) throw new DeliveryError(404, "DELIVERY_NOT_FOUND", "Delivery not found.");
    return delivery;
  }

  async getDelivery(deliveryId: string): Promise<Delivery> {
    return { ...this.find(deliveryId) };
  }

  // A cancel requested by FoodWise sends no webhook (we already know); `delivery.cancelled` is only
  // for a cancel on the provider's side (see simulate).
  async cancelDelivery(deliveryId: string, reason: string): Promise<Delivery> {
    const delivery = this.find(deliveryId);
    if (reason.trim() === "") {
      throw new DeliveryError(400, "INVALID_REQUEST", "A cancellation reason is required.");
    }
    if (delivery.status === "PICKED_UP" || delivery.status === "DELIVERED") {
      throw new DeliveryError(409, "ALREADY_PICKED_UP", "The courier has already picked up the goods.");
    }
    if (delivery.status === "FAILED" || delivery.status === "CANCELLED") {
      throw new DeliveryError(409, "DELIVERY_CLOSED", "The delivery is already closed.");
    }
    delivery.status = "CANCELLED";
    return { ...delivery };
  }

  parseWebhook(rawBody: string, headers: WebhookHeaders): DeliveryEvent {
    verifyWebhook(this.webhookSecret, rawBody, headers, this.now());
    return parseDeliveryEvent(rawBody);
  }

  // Whether the mock still knows a delivery (it forgets them on a restart).
  has(deliveryId: string): boolean {
    return this.deliveries.has(deliveryId);
  }

  // Takes back a delivery FoodWise stored before a restart, so the dev courier can go on with it.
  remember(delivery: Delivery): void {
    this.deliveries.set(delivery.delivery_id, { ...delivery });
  }

  // Plays the courier: moves the delivery on and returns the signed webhook call for the event.
  simulate(deliveryId: string, type: DeliveryEventType, options: SimulateOptions = {}): SignedWebhook {
    const delivery = this.find(deliveryId);
    const transition = TRANSITIONS[type];
    if (!transition.from.includes(delivery.status)) {
      throw new DeliveryError(409, "INVALID_TRANSITION", `A ${delivery.status} delivery cannot get ${type}.`);
    }
    delivery.status = transition.to;
    if (type === "delivery.courier_assigned") delivery.courier = options.courier ?? MOCK_COURIER;
    if (type === "delivery.failed") delivery.failure_reason = options.failureReason ?? "Courier could not reach the store.";

    const now = this.now();
    const event: DeliveryEvent = {
      event_id: `mock_evt_${randomUUID()}`,
      type,
      delivery_id: delivery.delivery_id,
      external_order_id: delivery.external_order_id,
      occurred_at: now.toISOString(),
      courier: delivery.courier,
      failure_reason: delivery.failure_reason,
    };
    const rawBody = JSON.stringify(event);
    return { rawBody, headers: signWebhook(this.webhookSecret, rawBody, now) };
  }
}
