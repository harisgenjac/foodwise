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
  COURIER_VEHICLES,
  DeliveryError,
  type Courier,
  type CourierRating,
  type CreateDeliveryRequest,
  type Delivery,
  type DeliveryEvent,
  type DeliveryEventType,
  type DeliveryFailureCode,
  type DeliveryProvider,
  type DeliveryStatus,
  type Quote,
  type QuoteRequest,
  type QuoteResult,
  type SignedWebhook,
  type WebhookHeaders,
} from "./types.js";

// A delivery provider without a network, for development, tests and e2e: it follows the contract
// (openapi.yaml) with fixed, predictable rules. State lives in memory, so a server
// restart forgets its deliveries. `simulate` plays the courier: it moves a delivery to the next
// status (or only moves its arrival estimate), recalculates the estimates as a real provider would
// and returns the signed webhook the real provider would send. A courier is random: a name, a
// phone, a vehicle and a placeholder photo from the client's public folder (/dev/couriers/) or
// none; the tracking_url is the client's dev page /dev/tracking/:deliveryId. Courier ratings are
// recorded (ratingsFor), and failNextRatings makes the next calls fail, as a provider that is down.

const MOCK_RULES = {
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

const COURIER_NAMES = [
  "Amar Hodžić",
  "Lejla Begović",
  "Emir Kovačević",
  "Selma Mehmedović",
  "Tarik Hadžić",
  "Ajla Delić",
] as const;
// client/public/dev/couriers/courier-1.svg … courier-3.svg
const COURIER_PHOTOS = 3;

// The provider's text that goes with a failure code.
const FAILURE_TEXTS: Record<DeliveryFailureCode, string> = {
  NO_COURIER: "No courier was available.",
  OUT_OF_ZONE: "The address is outside the delivery zone.",
  CANCELLED_BY_SERVICE: "The delivery service cancelled the delivery.",
  RECIPIENT_CLOSED: "The restaurant was closed when the courier arrived.",
  OTHER: "The courier could not complete the delivery.",
};

const MINUTE = 60_000;
// How far one estimate change may move the arrival.
const MAX_ESTIMATE_SHIFT_MINUTES = 120;

// The status a webhook moves a delivery to (null: it keeps its status), and the statuses it may
// come from.
const TRANSITIONS: Record<DeliveryEventType, { to: DeliveryStatus | null; from: DeliveryStatus[] }> = {
  "delivery.courier_assigned": { to: "COURIER_ASSIGNED", from: ["CREATED"] },
  "delivery.estimate_updated": { to: null, from: ["CREATED", "COURIER_ASSIGNED", "PICKED_UP"] },
  "delivery.picked_up": { to: "PICKED_UP", from: ["COURIER_ASSIGNED"] },
  "delivery.delivered": { to: "DELIVERED", from: ["PICKED_UP"] },
  "delivery.failed": { to: "FAILED", from: ["CREATED", "COURIER_ASSIGNED", "PICKED_UP"] },
  "delivery.cancelled": { to: "CANCELLED", from: ["CREATED", "COURIER_ASSIGNED"] },
};

interface StoredQuote {
  quote: Quote;
  priceCents: number;
}

interface MockProviderOptions {
  webhookSecret: string;
  now?: () => Date;
  // [0, 1) like Math.random; tests pass a fixed one.
  random?: () => number;
  // The client's origin, for the courier photos and the tracking page.
  publicBaseUrl?: string;
}

export interface SimulateOptions {
  // A fixed courier instead of a random one.
  courier?: Courier;
  // Whether a random courier has a photo (random when not given).
  photo?: boolean;
  // delivery.failed: the code (OTHER when not given) and the text (the code's text).
  failureCode?: DeliveryFailureCode;
  failureReason?: string;
  // delivery.estimate_updated: how many minutes the arrival moves (negative: earlier).
  minutes?: number;
}

export interface RecordedRating extends CourierRating {
  received_at: string;
}

export class MockProvider implements DeliveryProvider {
  readonly name = "mock" as const;
  private readonly webhookSecret: string;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly publicBaseUrl: string;
  private readonly quotes = new Map<string, StoredQuote>();
  private readonly deliveries = new Map<string, Delivery>();
  private readonly byIdempotencyKey = new Map<string, string>();
  // The minutes from the store to the restaurant per delivery, for new estimates.
  private readonly travelMinutes = new Map<string, number>();
  private readonly ratings = new Map<string, RecordedRating[]>();
  private failingRatings = 0;

  constructor(options: MockProviderOptions) {
    this.webhookSecret = options.webhookSecret;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.publicBaseUrl = (options.publicBaseUrl ?? "http://localhost:5173").replace(/\/+$/, "");
  }

  private pick<T>(values: readonly T[]): T {
    return values[Math.min(values.length - 1, Math.floor(this.random() * values.length))]!;
  }

  // A random courier: a name, a phone, a vehicle, and a placeholder photo or none.
  private randomCourier(photo: boolean | undefined): Courier {
    const digits = String(Math.floor(this.random() * 10_000_000)).padStart(7, "0").slice(0, 7);
    const withPhoto = photo ?? this.random() < 0.75;
    const photoNumber = 1 + Math.min(COURIER_PHOTOS - 1, Math.floor(this.random() * COURIER_PHOTOS));
    return {
      id: `mock_courier_${randomUUID().slice(0, 8)}`,
      name: this.pick(COURIER_NAMES),
      phone: `+3876${this.pick(["1", "2", "3"])}${digits}`,
      photo_url: withPhoto ? `${this.publicBaseUrl}/dev/couriers/courier-${photoNumber}.svg` : null,
      vehicle: this.pick(COURIER_VEHICLES),
    };
  }

  // The dev page that stands in for the provider's tracking page.
  trackingUrl(deliveryId: string): string {
    return `${this.publicBaseUrl}/dev/tracking/${encodeURIComponent(deliveryId)}`;
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
    return { priceCents, readyAt, pickupAt, deliveryAt, travelMinutes };
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
      courier_assigned_at: null,
      failure_code: null,
      failure_reason: null,
      tracking_url: null,
    };
    this.deliveries.set(delivery.delivery_id, delivery);
    this.byIdempotencyKey.set(idempotencyKey, delivery.delivery_id);
    this.travelMinutes.set(delivery.delivery_id, estimate.travelMinutes);
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

  // A cancel requested by Još vrijedi sends no webhook (we already know); `delivery.cancelled` is only
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

  async rateCourier(deliveryId: string, rating: CourierRating): Promise<void> {
    if (!Number.isInteger(rating.rating) || rating.rating < 1 || rating.rating > 5) {
      throw new DeliveryError(400, "INVALID_REQUEST", "The rating must be a whole number from 1 to 5.");
    }
    if (rating.comment !== null && (typeof rating.comment !== "string" || rating.comment.length > 500)) {
      throw new DeliveryError(400, "INVALID_REQUEST", "The comment is not valid.");
    }
    if (this.failingRatings > 0) {
      this.failingRatings--;
      throw new DeliveryError(503, "UNAVAILABLE", "The delivery service is not available.");
    }
    // Recorded even for a delivery the mock forgot on a restart: it only stands in for the service.
    const list = this.ratings.get(deliveryId) ?? [];
    list.push({ rating: rating.rating, comment: rating.comment, received_at: this.now().toISOString() });
    this.ratings.set(deliveryId, list);
  }

  // The ratings the mock received for a delivery.
  ratingsFor(deliveryId: string): RecordedRating[] {
    return [...(this.ratings.get(deliveryId) ?? [])];
  }

  // The next `count` rating calls fail, as when the provider is down.
  failNextRatings(count: number): void {
    this.failingRatings = count;
  }

  parseWebhook(rawBody: string, headers: WebhookHeaders): DeliveryEvent {
    verifyWebhook(this.webhookSecret, rawBody, headers, this.now());
    return parseDeliveryEvent(rawBody);
  }

  // Whether the mock still knows a delivery (it forgets them on a restart).
  has(deliveryId: string): boolean {
    return this.deliveries.has(deliveryId);
  }

  // Takes back a delivery Još vrijedi stored before a restart, so the dev courier can go on with it.
  remember(delivery: Delivery): void {
    this.deliveries.set(delivery.delivery_id, { ...delivery });
    const travel = Math.round(
      (new Date(delivery.estimated_delivery_at).getTime() - new Date(delivery.estimated_pickup_at).getTime()) / MINUTE,
    );
    this.travelMinutes.set(delivery.delivery_id, Math.max(travel, MOCK_RULES.handoverMinutes));
  }

  // The estimates after an event, recalculated on every step as a provider would.
  private updateEstimates(delivery: Delivery, type: DeliveryEventType, now: Date, options: SimulateOptions) {
    const travel = (this.travelMinutes.get(delivery.delivery_id) ?? MOCK_RULES.handoverMinutes) * MINUTE;
    const at = (time: number) => new Date(time).toISOString();
    switch (type) {
      case "delivery.courier_assigned": {
        // The courier needs a few minutes to reach the store and waits for the goods to be ready.
        const pickup = Math.max(
          new Date(delivery.ready_at).getTime(),
          now.getTime() + MOCK_RULES.pickupDelayMinutes * MINUTE,
        );
        delivery.estimated_pickup_at = at(pickup);
        delivery.estimated_delivery_at = at(pickup + travel);
        return;
      }
      case "delivery.picked_up":
        delivery.estimated_pickup_at = at(now.getTime());
        delivery.estimated_delivery_at = at(now.getTime() + travel);
        return;
      case "delivery.delivered":
        delivery.estimated_delivery_at = at(now.getTime());
        return;
      case "delivery.estimate_updated": {
        const minutes = options.minutes ?? 0;
        if (!Number.isInteger(minutes) || minutes === 0 || Math.abs(minutes) > MAX_ESTIMATE_SHIFT_MINUTES) {
          throw new DeliveryError(400, "INVALID_REQUEST", "The estimate change is not valid.");
        }
        const next = new Date(delivery.estimated_delivery_at).getTime() + minutes * MINUTE;
        // The arrival stays after the courier's pickup and in the future.
        if (next <= Math.max(now.getTime(), new Date(delivery.estimated_pickup_at).getTime())) {
          throw new DeliveryError(409, "INVALID_TRANSITION", "The arrival cannot be earlier than this.");
        }
        delivery.estimated_delivery_at = at(next);
        return;
      }
      default:
        return;
    }
  }

  // Plays the courier: moves the delivery on and returns the signed webhook call for the event.
  simulate(deliveryId: string, type: DeliveryEventType, options: SimulateOptions = {}): SignedWebhook {
    const delivery = this.find(deliveryId);
    const transition = TRANSITIONS[type];
    if (!transition.from.includes(delivery.status)) {
      throw new DeliveryError(409, "INVALID_TRANSITION", `A ${delivery.status} delivery cannot get ${type}.`);
    }
    const now = this.now();
    this.updateEstimates(delivery, type, now, options);
    if (transition.to !== null) delivery.status = transition.to;
    if (type === "delivery.courier_assigned") {
      delivery.courier = options.courier ?? this.randomCourier(options.photo);
      delivery.courier_assigned_at = now.toISOString();
      delivery.tracking_url = this.trackingUrl(delivery.delivery_id);
    }
    if (type === "delivery.failed" || type === "delivery.cancelled") {
      const code = type === "delivery.cancelled" ? "CANCELLED_BY_SERVICE" : (options.failureCode ?? "OTHER");
      delivery.failure_code = code;
      delivery.failure_reason = options.failureReason ?? FAILURE_TEXTS[code];
    }

    const event: DeliveryEvent = {
      event_id: `mock_evt_${randomUUID()}`,
      type,
      delivery_id: delivery.delivery_id,
      external_order_id: delivery.external_order_id,
      occurred_at: now.toISOString(),
      courier: delivery.courier,
      estimated_pickup_at: delivery.estimated_pickup_at,
      estimated_delivery_at: delivery.estimated_delivery_at,
      tracking_url: delivery.tracking_url,
      failure_code: delivery.failure_code,
      failure_reason: delivery.failure_reason,
    };
    const rawBody = JSON.stringify(event);
    return { rawBody, headers: signWebhook(this.webhookSecret, rawBody, now) };
  }
}
