import {
  DELIVERY_EVENT_TYPES,
  DeliveryError,
  type Courier,
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

const parseCourier = (value: unknown): Courier | null => {
  if (value === undefined || value === null) return null;
  const courier = value as Record<string, unknown>;
  if (typeof value !== "object" || !nonEmpty(courier.name) || !nonEmpty(courier.phone)) throw invalidEvent();
  return { name: courier.name, phone: courier.phone };
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
  const failureReason = event.failure_reason ?? null;
  if (failureReason !== null && typeof failureReason !== "string") throw invalidEvent();
  if (event.type === "delivery.failed" && !nonEmpty(failureReason)) throw invalidEvent();
  return {
    event_id: event.event_id,
    type: event.type as DeliveryEventType,
    delivery_id: event.delivery_id,
    external_order_id: event.external_order_id as number,
    occurred_at: event.occurred_at as string,
    courier: parseCourier(event.courier),
    failure_reason: failureReason,
  };
};
