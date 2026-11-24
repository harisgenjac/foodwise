// The delivery contract (openapi.yaml) as TypeScript types, and the interface every
// delivery provider implements: the mock now, Korpa later, our own delivery app after that.
// Money is a string with two decimals in KM ("12.50"); times are ISO 8601 strings with an offset.

export interface DeliveryLocation {
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  phone: string;
}

export interface QuoteRequest {
  pickup: DeliveryLocation;
  dropoff: DeliveryLocation;
  // When the store will have the goods ready.
  ready_at: string;
  // The value of the goods, which the courier collects in cash together with the delivery price.
  goods_amount: string;
}

export interface Quote {
  quote_id: string;
  price: string;
  currency: "BAM";
  estimated_pickup_at: string;
  estimated_delivery_at: string;
  expires_at: string;
}

const QUOTE_UNAVAILABLE_CODES = ["OUT_OF_ZONE", "UNAVAILABLE"] as const;
export type QuoteUnavailableCode = (typeof QUOTE_UNAVAILABLE_CODES)[number];

export type QuoteResult =
  | { available: true; quote: Quote }
  | { available: false; code: QuoteUnavailableCode; message: string };

export interface CreateDeliveryRequest {
  // The quote the restaurant saw; the provider may re-price without it.
  quote_id?: string;
  external_order_id: number;
  external_order_code: string;
  pickup: DeliveryLocation;
  dropoff: DeliveryLocation;
  ready_at: string;
  goods_amount: string;
  // Goods plus the delivery price: what the courier collects from the restaurant.
  cash_to_collect: string;
  notes?: string;
}

export const DELIVERY_STATUSES = [
  "CREATED",
  "COURIER_ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const COURIER_VEHICLES = ["BICYCLE", "SCOOTER", "CAR"] as const;
export type CourierVehicle = (typeof COURIER_VEHICLES)[number];

// The courier the provider assigned. `id` is the provider's own id of the courier (a rating names
// it); the photo is an absolute URL, or null when the courier has none.
export interface Courier {
  id: string;
  name: string;
  phone: string;
  photo_url: string | null;
  vehicle: CourierVehicle | null;
}

// Why a delivery failed or was cancelled on the provider's side. The provider's text
// (failure_reason) goes with it, for the logs and the admin.
export const DELIVERY_FAILURE_CODES = [
  "NO_COURIER",
  "OUT_OF_ZONE",
  "CANCELLED_BY_SERVICE",
  "RECIPIENT_CLOSED",
  "OTHER",
] as const;
export type DeliveryFailureCode = (typeof DELIVERY_FAILURE_CODES)[number];

export interface Delivery {
  delivery_id: string;
  external_order_id: number;
  status: DeliveryStatus;
  price: string;
  currency: "BAM";
  ready_at: string;
  estimated_pickup_at: string;
  estimated_delivery_at: string;
  courier: Courier | null;
  courier_assigned_at: string | null;
  failure_code: DeliveryFailureCode | null;
  failure_reason: string | null;
  // Always set once a courier is assigned: the provider's page where the delivery can be followed.
  tracking_url: string | null;
}

export const DELIVERY_EVENT_TYPES = [
  "delivery.courier_assigned",
  // The estimates changed without a status change (traffic, a busy store).
  "delivery.estimate_updated",
  "delivery.picked_up",
  "delivery.delivered",
  "delivery.failed",
  "delivery.cancelled",
] as const;
export type DeliveryEventType = (typeof DELIVERY_EVENT_TYPES)[number];

// One webhook call from the provider. `event_id` is unique per event: a repeated delivery of the
// same event (the provider retries until it gets a 2xx) must be ignored.
export interface DeliveryEvent {
  event_id: string;
  type: DeliveryEventType;
  delivery_id: string;
  external_order_id: number;
  occurred_at: string;
  courier: Courier | null;
  // The provider's current estimates when the event happened (null when it sent none). Any event
  // may move them, and Još vrijedi keeps each one in the delivery's history.
  estimated_pickup_at: string | null;
  estimated_delivery_at: string | null;
  // Required for delivery.courier_assigned, optional otherwise.
  tracking_url: string | null;
  // For delivery.failed (OTHER when the provider sends none) and delivery.cancelled
  // (CANCELLED_BY_SERVICE when it sends none).
  failure_code: DeliveryFailureCode | null;
  failure_reason: string | null;
}

// A restaurant's rating of the courier who delivered an order: 1 to 5 and an optional comment.
export interface CourierRating {
  rating: number;
  comment: string | null;
}

export type WebhookHeaders = Record<string, string | string[] | undefined>;

export interface SignedWebhook {
  rawBody: string;
  headers: Record<string, string>;
}

export interface DeliveryProvider {
  readonly name: DeliveryProviderName;
  quote(request: QuoteRequest): Promise<QuoteResult>;
  // The same idempotency key always returns the same delivery, so a retried request never books a
  // second courier.
  createDelivery(request: CreateDeliveryRequest, idempotencyKey: string): Promise<Delivery>;
  getDelivery(deliveryId: string): Promise<Delivery>;
  // Only before the courier picked the goods up.
  cancelDelivery(deliveryId: string, reason: string): Promise<Delivery>;
  // Passes the restaurant's rating of a delivered delivery's courier on to the provider. A failure
  // throws (a DeliveryError or a network error); the caller keeps the rating and retries later.
  rateCourier(deliveryId: string, rating: CourierRating): Promise<void>;
  // Checks the signature and the shape of a webhook call and returns its event; throws
  // DeliveryError (status 401 for the signature, 400 for the body) otherwise.
  parseWebhook(rawBody: string, headers: WebhookHeaders): DeliveryEvent;
}

export const DELIVERY_PROVIDERS = ["mock"] as const;
export type DeliveryProviderName = (typeof DELIVERY_PROVIDERS)[number];

// A refusal of the provider or of a webhook, with the HTTP status our endpoint answers with and a
// machine-readable code (the codes of the contract, e.g. ALREADY_PICKED_UP).
export class DeliveryError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
