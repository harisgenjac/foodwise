import { MockProvider } from "../src/delivery/mock.js";
import { parseDeliveryEvent, parseMoney, formatMoney } from "../src/delivery/contract.js";
import { haversineKm } from "../src/delivery/distance.js";
import { signWebhook } from "../src/delivery/signature.js";
import {
  DELIVERY_FAILURE_CODES,
  DeliveryError,
  type Courier,
  type CreateDeliveryRequest,
  type DeliveryLocation,
  type Quote,
  type QuoteRequest,
} from "../src/delivery/types.js";

const SECRET = "mock-test-secret-1234";

// Sarajevo centre → Ilidža is 8.76 km: 3.00 + 0.70 × 8.76 = 9.13 → 9.10 KM, 26 + 5 = 31 minutes.
const STORE: DeliveryLocation = {
  name: "Market",
  address: "Ferhadija 1",
  city: "Sarajevo",
  latitude: 43.8563,
  longitude: 18.4131,
  phone: "+38733000000",
};
const RESTAURANT: DeliveryLocation = {
  name: "Restoran",
  address: "Butmirska cesta 2",
  city: "Ilidža",
  latitude: 43.8296,
  longitude: 18.3103,
  phone: "+38733111111",
};
const ZENICA: DeliveryLocation = { ...RESTAURANT, city: "Zenica", latitude: 44.2017, longitude: 17.9078 };

const NOW = new Date("2026-11-16T10:00:00.000Z");
const READY = "2026-11-16T10:30:00.000Z";

const quoteRequest = (overrides: Partial<QuoteRequest> = {}): QuoteRequest => ({
  pickup: STORE,
  dropoff: RESTAURANT,
  ready_at: READY,
  goods_amount: "20.00",
  ...overrides,
});

const deliveryRequest = (overrides: Partial<CreateDeliveryRequest> = {}): CreateDeliveryRequest => ({
  external_order_id: 42,
  external_order_code: "K7PM",
  ...quoteRequest(),
  cash_to_collect: "29.10",
  ...overrides,
});

const refusal = async (promise: Promise<unknown> | (() => unknown)): Promise<DeliveryError> => {
  try {
    await (typeof promise === "function" ? promise() : promise);
  } catch (error) {
    expect(error).toBeInstanceOf(DeliveryError);
    return error as DeliveryError;
  }
  throw new Error("Expected a refusal.");
};

let clock: Date;
let provider: MockProvider;

const BASE = "http://localhost:5173";

beforeEach(() => {
  clock = NOW;
  provider = new MockProvider({ webhookSecret: SECRET, now: () => clock, publicBaseUrl: BASE });
});

const COURIER: Courier = {
  id: "c_1",
  name: "Amar Hodžić",
  phone: "+38761000000",
  photo_url: "https://cdn.example/c1.jpg",
  vehicle: "SCOOTER",
};

const quoteOf = async (request = quoteRequest()): Promise<Quote> => {
  const result = await provider.quote(request);
  if (!result.available) throw new Error("Expected a quote.");
  return result.quote;
};

describe("contract helpers", () => {
  it("parses and formats money in whole cents", () => {
    expect(parseMoney("9.10")).toBe(910);
    expect(parseMoney("0.05")).toBe(5);
    for (const bad of ["9.1", "9", "-1.00", "1e3", 9.1, "", "12345678.00"]) expect(parseMoney(bad)).toBeNull();
    expect(formatMoney(910)).toBe("9.10");
    expect(formatMoney(5)).toBe("0.05");
    expect(formatMoney(2910)).toBe("29.10");
  });

  it("measures the straight-line distance like city_distance_km", () => {
    expect(haversineKm(STORE, STORE)).toBe(0);
    expect(haversineKm(STORE, RESTAURANT)).toBeCloseTo(8.763, 3);
  });

  it("parses a webhook event and refuses a malformed one", () => {
    const event = {
      event_id: "evt_1",
      type: "delivery.failed",
      delivery_id: "dlv_1",
      external_order_id: 42,
      occurred_at: "2026-11-16T10:00:00+01:00",
      courier: null,
      failure_reason: "Store closed.",
    };
    // A failure without a code is OTHER; the new fields are null when missing.
    expect(parseDeliveryEvent(JSON.stringify(event))).toEqual({
      ...event,
      estimated_pickup_at: null,
      estimated_delivery_at: null,
      tracking_url: null,
      failure_code: "OTHER",
    });
    const cancelled = { ...event, type: "delivery.cancelled", failure_reason: null };
    expect(parseDeliveryEvent(JSON.stringify(cancelled)).failure_code).toBe("CANCELLED_BY_SERVICE");
    const assigned = {
      ...event,
      type: "delivery.courier_assigned",
      failure_reason: null,
      courier: COURIER,
      tracking_url: "https://track.example/1",
      estimated_pickup_at: "2026-11-16T10:30:00Z",
      estimated_delivery_at: "2026-11-16T11:01:00Z",
      failure_code: "NO_COURIER",
    };
    // A code only goes with a failure or a cancel.
    expect(parseDeliveryEvent(JSON.stringify(assigned))).toEqual({ ...assigned, failure_code: null });
    const withoutPhoto = { ...assigned, courier: { id: "c_2", name: "Kurir", phone: "+387" } };
    expect(parseDeliveryEvent(JSON.stringify(withoutPhoto)).courier).toEqual({
      id: "c_2",
      name: "Kurir",
      phone: "+387",
      photo_url: null,
      vehicle: null,
    });
    const bad = [
      "not json",
      "[]",
      JSON.stringify({ ...event, type: "delivery.lost" }),
      JSON.stringify({ ...event, external_order_id: "42" }),
      JSON.stringify({ ...event, occurred_at: "yesterday" }),
      JSON.stringify({ ...event, failure_reason: null }),
      JSON.stringify({ ...event, courier: { name: "Kurir" } }),
      JSON.stringify({ ...event, failure_code: "LOST" }),
      JSON.stringify({ ...event, estimated_delivery_at: "soon" }),
      JSON.stringify({ ...assigned, tracking_url: null }),
      JSON.stringify({ ...assigned, courier: null }),
      JSON.stringify({ ...assigned, courier: { ...COURIER, id: "" } }),
      JSON.stringify({ ...assigned, courier: { ...COURIER, vehicle: "TRUCK" } }),
      JSON.stringify({ ...assigned, courier: { ...COURIER, photo_url: "javascript:alert(1)" } }),
    ];
    for (const body of bad) {
      expect(() => parseDeliveryEvent(body)).toThrow("Webhook body is not a valid delivery event.");
    }
  });
});

describe("MockProvider quote", () => {
  it("prices by distance and times from the ready time", async () => {
    const quote = await quoteOf();
    expect(quote).toMatchObject({
      price: "9.10",
      currency: "BAM",
      estimated_pickup_at: "2026-11-16T10:35:00.000Z",
      estimated_delivery_at: "2026-11-16T11:06:00.000Z",
      expires_at: "2026-11-16T10:10:00.000Z",
    });
    expect(quote.quote_id).toMatch(/^mock_q_/);
  });

  it("counts from now when the ready time has passed", async () => {
    const quote = await quoteOf(quoteRequest({ ready_at: "2026-11-16T09:00:00Z" }));
    expect(quote.estimated_pickup_at).toBe("2026-11-16T10:05:00.000Z");
  });

  it("charges the base price for the same address", async () => {
    expect((await quoteOf(quoteRequest({ dropoff: STORE }))).price).toBe("3.00");
  });

  it("answers OUT_OF_ZONE beyond 25 km", async () => {
    expect(await provider.quote(quoteRequest({ dropoff: ZENICA }))).toEqual({
      available: false,
      code: "OUT_OF_ZONE",
      message: "The address is outside the delivery zone.",
    });
  });

  it("refuses an invalid request", async () => {
    const cases: [Partial<QuoteRequest>, string][] = [
      [{ pickup: { ...STORE, latitude: 91 } }, "The pickup location is not valid."],
      [{ dropoff: { ...RESTAURANT, address: " " } }, "The dropoff location is not valid."],
      [{ ready_at: "2026-11-16 10:30" }, "The ready time is not a valid date and time."],
      [{ goods_amount: "20" }, "The goods amount is not a valid amount."],
    ];
    for (const [overrides, message] of cases) {
      const error = await refusal(provider.quote(quoteRequest(overrides)));
      expect(error).toMatchObject({ status: 400, code: "INVALID_REQUEST", message });
    }
  });
});

describe("MockProvider deliveries", () => {
  it("creates a delivery at the quoted price", async () => {
    const quote = await quoteOf();
    const delivery = await provider.createDelivery(deliveryRequest({ quote_id: quote.quote_id }), "order-42");
    expect(delivery).toMatchObject({
      external_order_id: 42,
      status: "CREATED",
      price: "9.10",
      ready_at: READY,
      estimated_pickup_at: quote.estimated_pickup_at,
      courier: null,
      failure_reason: null,
    });
    expect(await provider.getDelivery(delivery.delivery_id)).toEqual(delivery);
  });

  it("returns the same delivery for the same idempotency key", async () => {
    const first = await provider.createDelivery(deliveryRequest(), "order-42");
    const again = await provider.createDelivery(deliveryRequest(), "order-42");
    expect(again.delivery_id).toBe(first.delivery_id);
    const other = await provider.createDelivery(deliveryRequest(), "order-43");
    expect(other.delivery_id).not.toBe(first.delivery_id);
  });

  it("refuses an unknown or expired quote", async () => {
    expect(await refusal(provider.createDelivery(deliveryRequest({ quote_id: "nope" }), "k1"))).toMatchObject({
      status: 404,
      code: "QUOTE_NOT_FOUND",
    });
    const quote = await quoteOf();
    clock = new Date(NOW.getTime() + 11 * 60_000);
    expect(await refusal(provider.createDelivery(deliveryRequest({ quote_id: quote.quote_id }), "k2"))).toMatchObject({
      status: 409,
      code: "QUOTE_EXPIRED",
    });
  });

  it("checks the cash to collect, the order reference, the zone and the key", async () => {
    expect(await refusal(provider.createDelivery(deliveryRequest({ cash_to_collect: "20.00" }), "k1"))).toMatchObject({
      status: 400,
      message: "The cash to collect must equal the goods amount plus the delivery price.",
    });
    expect(await refusal(provider.createDelivery(deliveryRequest({ external_order_code: "" }), "k2"))).toMatchObject({
      status: 400,
      message: "The order reference is not valid.",
    });
    expect(await refusal(provider.createDelivery(deliveryRequest({ dropoff: ZENICA }), "k3"))).toMatchObject({
      status: 422,
      code: "OUT_OF_ZONE",
    });
    expect(await refusal(provider.createDelivery(deliveryRequest(), " "))).toMatchObject({
      status: 400,
      message: "The Idempotency-Key header is required.",
    });
  });

  it("answers DELIVERY_NOT_FOUND for an unknown delivery", async () => {
    expect(await refusal(provider.getDelivery("mock_dlv_unknown"))).toMatchObject({
      status: 404,
      code: "DELIVERY_NOT_FOUND",
    });
  });

  it("cancels before the pickup and refuses after it", async () => {
    const early = await provider.createDelivery(deliveryRequest(), "k1");
    provider.simulate(early.delivery_id, "delivery.courier_assigned");
    expect((await provider.cancelDelivery(early.delivery_id, "Restaurant cancelled.")).status).toBe("CANCELLED");
    expect(await refusal(provider.cancelDelivery(early.delivery_id, "Again."))).toMatchObject({
      status: 409,
      code: "DELIVERY_CLOSED",
    });

    const late = await provider.createDelivery(deliveryRequest(), "k2");
    provider.simulate(late.delivery_id, "delivery.courier_assigned");
    provider.simulate(late.delivery_id, "delivery.picked_up");
    expect(await refusal(provider.cancelDelivery(late.delivery_id, "Too late."))).toMatchObject({
      status: 409,
      code: "ALREADY_PICKED_UP",
    });
    expect(await refusal(provider.cancelDelivery(late.delivery_id, " "))).toMatchObject({ status: 400 });
  });
});

describe("MockProvider simulated courier and webhooks", () => {
  it("runs a delivery to the end with a signed webhook for every step", async () => {
    const { delivery_id } = await provider.createDelivery(deliveryRequest(), "k1");
    const steps = ["delivery.courier_assigned", "delivery.picked_up", "delivery.delivered"] as const;
    const statuses = [];
    const eventIds = new Set<string>();
    for (const type of steps) {
      const call = provider.simulate(delivery_id, type, { courier: COURIER });
      const event = provider.parseWebhook(call.rawBody, call.headers);
      expect(event).toMatchObject({ type, delivery_id, external_order_id: 42, courier: COURIER });
      eventIds.add(event.event_id);
      statuses.push((await provider.getDelivery(delivery_id)).status);
    }
    expect(statuses).toEqual(["COURIER_ASSIGNED", "PICKED_UP", "DELIVERED"]);
    expect(eventIds.size).toBe(3);
  });

  it("fails a delivery with a reason, and the provider can cancel it on its side", async () => {
    const failed = await provider.createDelivery(deliveryRequest(), "k1");
    const call = provider.simulate(failed.delivery_id, "delivery.failed", { failureReason: "No courier available." });
    expect(provider.parseWebhook(call.rawBody, call.headers)).toMatchObject({
      type: "delivery.failed",
      courier: null,
      failure_code: "OTHER",
      failure_reason: "No courier available.",
    });

    const cancelled = await provider.createDelivery(deliveryRequest(), "k2");
    const cancel = provider.simulate(cancelled.delivery_id, "delivery.cancelled");
    expect(provider.parseWebhook(cancel.rawBody, cancel.headers)).toMatchObject({
      failure_code: "CANCELLED_BY_SERVICE",
      failure_reason: "The delivery service cancelled the delivery.",
    });
    expect((await provider.getDelivery(cancelled.delivery_id)).status).toBe("CANCELLED");
  });

  it("refuses a step out of order", async () => {
    const { delivery_id } = await provider.createDelivery(deliveryRequest(), "k1");
    expect(await refusal(() => provider.simulate(delivery_id, "delivery.delivered"))).toMatchObject({
      status: 409,
      code: "INVALID_TRANSITION",
      message: "A CREATED delivery cannot get delivery.delivered.",
    });
    provider.simulate(delivery_id, "delivery.courier_assigned");
    provider.simulate(delivery_id, "delivery.picked_up");
    expect(await refusal(() => provider.simulate(delivery_id, "delivery.cancelled"))).toMatchObject({
      code: "INVALID_TRANSITION",
    });
    provider.simulate(delivery_id, "delivery.delivered");
    expect(await refusal(() => provider.simulate(delivery_id, "delivery.failed"))).toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("refuses a webhook with a changed body, another secret or an old timestamp", async () => {
    const { delivery_id } = await provider.createDelivery(deliveryRequest(), "k1");
    const call = provider.simulate(delivery_id, "delivery.courier_assigned");
    const changed = call.rawBody.replace("courier_assigned", "delivered");
    expect(await refusal(() => provider.parseWebhook(changed, call.headers))).toMatchObject({ status: 401 });
    const foreign = signWebhook("another-secret-12345", call.rawBody, clock);
    expect(await refusal(() => provider.parseWebhook(call.rawBody, foreign))).toMatchObject({ status: 401 });
    clock = new Date(NOW.getTime() + 6 * 60_000);
    expect(await refusal(() => provider.parseWebhook(call.rawBody, call.headers))).toMatchObject({
      status: 401,
      message: "Webhook timestamp is outside the allowed window.",
    });
  });

  it("refuses an arrival estimate change that is not valid or would be too early", async () => {
    const { delivery_id } = await provider.createDelivery(deliveryRequest(), "k1");
    for (const minutes of [0, 1.5, 121, -121]) {
      expect(await refusal(() => provider.simulate(delivery_id, "delivery.estimate_updated", { minutes }))).toMatchObject({
        status: 400,
        message: "The estimate change is not valid.",
      });
    }
    // Pickup 10:35, arrival 11:06: 31 minutes earlier would be before the pickup.
    expect(
      await refusal(() => provider.simulate(delivery_id, "delivery.estimate_updated", { minutes: -31 })),
    ).toMatchObject({ code: "INVALID_TRANSITION" });
    provider.simulate(delivery_id, "delivery.estimate_updated", { minutes: -30 });
    expect((await provider.getDelivery(delivery_id)).estimated_delivery_at).toBe("2026-11-16T10:36:00.000Z");
  });

  it("refuses a correctly signed body that is not an event", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const headers = signWebhook(SECRET, rawBody, clock);
    expect(() => provider.parseWebhook(rawBody, headers)).toThrow("Webhook body is not a valid delivery event.");
  });
});

describe("MockProvider couriers, estimates and ratings", () => {
  // 0.5 picks the middle of each list: "Selma Mehmedović", the SCOOTER, photo 2.
  const fixed = (value: number) =>
    new MockProvider({ webhookSecret: SECRET, now: () => clock, random: () => value, publicBaseUrl: BASE });
  const eventOf = (mock: MockProvider, deliveryId: string, ...args: Parameters<MockProvider["simulate"]> extends [string, ...infer R] ? R : never) => {
    const call = mock.simulate(deliveryId, ...args);
    return mock.parseWebhook(call.rawBody, call.headers);
  };

  it("assigns a random courier with a vehicle, a photo or none, and the tracking page", async () => {
    const mock = fixed(0.5);
    const { delivery_id } = await mock.createDelivery(deliveryRequest(), "k1");
    const event = eventOf(mock, delivery_id, "delivery.courier_assigned", { photo: true });
    expect(event.courier).toMatchObject({
      name: "Selma Mehmedović",
      vehicle: "SCOOTER",
      photo_url: `${BASE}/dev/couriers/courier-2.svg`,
    });
    expect(event.courier!.id).toMatch(/^mock_courier_/);
    expect(event.courier!.phone).toMatch(/^\+3876\d{8}$/);
    expect(event.tracking_url).toBe(`${BASE}/dev/tracking/${delivery_id}`);
    expect(await mock.getDelivery(delivery_id)).toMatchObject({
      courier_assigned_at: NOW.toISOString(),
      tracking_url: `${BASE}/dev/tracking/${delivery_id}`,
    });

    const other = await mock.createDelivery(deliveryRequest(), "k2");
    expect(eventOf(mock, other.delivery_id, "delivery.courier_assigned", { photo: false }).courier!.photo_url).toBeNull();
    // Without a choice the photo is random (0.9: none).
    const late = fixed(0.9);
    const third = await late.createDelivery(deliveryRequest(), "k3");
    expect(eventOf(late, third.delivery_id, "delivery.courier_assigned").courier).toMatchObject({
      photo_url: null,
      vehicle: "CAR",
    });
  });

  it("recalculates the exact estimates on every step and moves the arrival on request", async () => {
    const { delivery_id } = await provider.createDelivery(deliveryRequest(), "k1");
    // Ready 10:30: the courier comes at 10:30 (assigned at 10:00 + 5 minutes is earlier), 31 minutes to the restaurant.
    expect(eventOf(provider, delivery_id, "delivery.courier_assigned")).toMatchObject({
      estimated_pickup_at: "2026-11-16T10:30:00.000Z",
      estimated_delivery_at: "2026-11-16T11:01:00.000Z",
    });
    clock = new Date("2026-11-16T10:40:00.000Z");
    expect(eventOf(provider, delivery_id, "delivery.picked_up")).toMatchObject({
      estimated_pickup_at: "2026-11-16T10:40:00.000Z",
      estimated_delivery_at: "2026-11-16T11:11:00.000Z",
    });
    expect(eventOf(provider, delivery_id, "delivery.estimate_updated", { minutes: 5 })).toMatchObject({
      type: "delivery.estimate_updated",
      estimated_delivery_at: "2026-11-16T11:16:00.000Z",
    });
    expect(eventOf(provider, delivery_id, "delivery.estimate_updated", { minutes: -5 }).estimated_delivery_at).toBe(
      "2026-11-16T11:11:00.000Z",
    );
    expect((await provider.getDelivery(delivery_id)).status).toBe("PICKED_UP");
    clock = new Date("2026-11-16T11:05:00.000Z");
    expect(eventOf(provider, delivery_id, "delivery.delivered").estimated_delivery_at).toBe("2026-11-16T11:05:00.000Z");
  });

  it("fails with every failure code, before and after the pickup", async () => {
    for (const [index, code] of DELIVERY_FAILURE_CODES.entries()) {
      const before = await provider.createDelivery(deliveryRequest(), `before-${index}`);
      expect(eventOf(provider, before.delivery_id, "delivery.failed", { failureCode: code })).toMatchObject({
        type: "delivery.failed",
        failure_code: code,
        failure_reason: expect.any(String),
      });
      const after = await provider.createDelivery(deliveryRequest(), `after-${index}`);
      provider.simulate(after.delivery_id, "delivery.courier_assigned");
      provider.simulate(after.delivery_id, "delivery.picked_up");
      expect(eventOf(provider, after.delivery_id, "delivery.failed", { failureCode: code }).failure_code).toBe(code);
      expect(await provider.getDelivery(after.delivery_id)).toMatchObject({ status: "FAILED", failure_code: code });
    }
  });

  it("records courier ratings and can fail them like a provider that is down", async () => {
    await provider.rateCourier("dlv_1", { rating: 5, comment: "Brz i ljubazan." });
    expect(provider.ratingsFor("dlv_1")).toEqual([
      { rating: 5, comment: "Brz i ljubazan.", received_at: NOW.toISOString() },
    ]);
    provider.failNextRatings(1);
    expect(await refusal(provider.rateCourier("dlv_2", { rating: 3, comment: null }))).toMatchObject({ status: 503 });
    await provider.rateCourier("dlv_2", { rating: 3, comment: null });
    expect(provider.ratingsFor("dlv_2")).toHaveLength(1);
    expect(await refusal(provider.rateCourier("dlv_3", { rating: 6, comment: null }))).toMatchObject({ status: 400 });
    expect(provider.ratingsFor("dlv_3")).toEqual([]);
  });
});
