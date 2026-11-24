import {
  COURIER_VEHICLES,
  DELIVERY_EVENT_TYPES,
  DELIVERY_FAILURE_CODES,
  DeliveryError,
  type Courier,
  type CourierVehicle,
  type DeliveryFailureCode,
  type DeliveryEvent,
  type DeliveryEventType,
  type DeliveryLocation,
} from "./types.js";

// Checks shared by every provider: the money and time formats of the contract and the shape of a
// webhook event.

const MONEY = /^\d{1,7}\.\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const badRequest = (message: string) => new DeliveryError(400, "INVALID_REQUEST", message);

// "12.50" → 1250 (whole cents, so sums never drift); null for anything else.
export const parseMoney = (value: unknown): number | null => {
  if (typeof value !== "string" || !MONEY.test(value)) return null;
  const [whole, cents] = value.split(".") as [string, string];
  return Number(whole) * 100 + Number(cents);
};

export const formatMoney = (cents: number): string => {
  const whole = Math.floor(cents / 100);
  return `${whole}.${String(cents % 100).padStart(2, "0")}`;
};

const parseDateTime = (value: unknown): Date | null => {
  if (typeof value !== "string" || !ISO_DATE_TIME.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

const inRange = (value: unknown, limit: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;

export const assertLocation = (location: DeliveryLocation | undefined, field: "pickup" | "dropoff"): void => {
  if (
    !location ||
    !nonEmpty(location.name) ||
    !nonEmpty(location.address) ||
    !nonEmpty(location.city) ||
    !nonEmpty(location.phone) ||
    !inRange(location.latitude, 90) ||
    !inRange(location.longitude, 180)
  ) {
    throw badRequest(`The ${field} location is not valid.`);
  }
};

export const requireMoney = (value: unknown, field: string): number => {
  const cents = parseMoney(value);
  if (cents === null) throw badRequest(`The ${field} is not a valid amount.`);
  return cents;
};

export const requireDateTime = (value: unknown, field: string): Date => {
  const date = parseDateTime(value);
  if (date === null) throw badRequest(`The ${field} is not a valid date and time.`);
  return date;
};

const invalidEvent = () => new DeliveryError(400, "INVALID_EVENT", "Webhook body is not a valid delivery event.");

const isHttpUrl = (value: unknown): value is string => {
  if (!nonEmpty(value) || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

// A nullable optional field: missing and null are both null; anything else must pass the check.
const optional = <T>(value: unknown, check: (value: unknown) => value is T): T | null => {
  if (value === undefined || value === null) return null;
  if (!check(value)) throw invalidEvent();
  return value;
};

const isVehicle = (value: unknown): value is CourierVehicle => (COURIER_VEHICLES as readonly unknown[]).includes(value);
const isFailureCode = (value: unknown): value is DeliveryFailureCode =>
  (DELIVERY_FAILURE_CODES as readonly unknown[]).includes(value);
const isDateTime = (value: unknown): value is string => parseDateTime(value) !== null;

const parseCourier = (value: unknown): Courier | null => {
  if (value === undefined || value === null) return null;
  const courier = value as Record<string, unknown>;
  if (typeof value !== "object" || !nonEmpty(courier.id) || !nonEmpty(courier.name) || !nonEmpty(courier.phone)) {
    throw invalidEvent();
  }
  return {
    id: courier.id,
    name: courier.name,
    phone: courier.phone,
    photo_url: optional(courier.photo_url, isHttpUrl),
    vehicle: optional(courier.vehicle, isVehicle),
  };
};

// The body of a webhook call (after its signature was checked) as a DeliveryEvent.
export const parseDeliveryEvent = (rawBody: string): DeliveryEvent => {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw invalidEvent();
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw invalidEvent();
  const event = body as Record<string, unknown>;
  if (
    !nonEmpty(event.event_id) ||
    !nonEmpty(event.delivery_id) ||
    !(DELIVERY_EVENT_TYPES as readonly unknown[]).includes(event.type) ||
    !Number.isSafeInteger(event.external_order_id) ||
    parseDateTime(event.occurred_at) === null
  ) {
    throw invalidEvent();
  }
  const type = event.type as DeliveryEventType;
  const failureReason = event.failure_reason ?? null;
  if (failureReason !== null && typeof failureReason !== "string") throw invalidEvent();
  if (type === "delivery.failed" && !nonEmpty(failureReason)) throw invalidEvent();
  const courier = parseCourier(event.courier);
  const trackingUrl = optional(event.tracking_url, isHttpUrl);
  // A courier is always assigned with the page where the delivery can be followed.
  if (type === "delivery.courier_assigned" && (courier === null || trackingUrl === null)) throw invalidEvent();
  let failureCode = optional(event.failure_code, isFailureCode);
  if (type === "delivery.failed") failureCode ??= "OTHER";
  else if (type === "delivery.cancelled") failureCode ??= "CANCELLED_BY_SERVICE";
  else failureCode = null;
  return {
    event_id: event.event_id,
    type,
    delivery_id: event.delivery_id,
    external_order_id: event.external_order_id as number,
    occurred_at: event.occurred_at as string,
    courier,
    estimated_pickup_at: optional(event.estimated_pickup_at, isDateTime),
    estimated_delivery_at: optional(event.estimated_delivery_at, isDateTime),
    tracking_url: trackingUrl,
    failure_code: failureCode,
    failure_reason: failureReason,
  };
};
