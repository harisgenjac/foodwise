import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { getDeliveryProvider } from "../src/delivery/config.js";
import { MockProvider, type SimulateOptions } from "../src/delivery/mock.js";
import { signWebhook } from "../src/delivery/signature.js";
import { DELIVERY_FAILURE_CODES, type Courier, type DeliveryEventType, type SignedWebhook } from "../src/delivery/types.js";
import { type Agent, cityId, cleanupUsers, createProduct, futureDate, registerAndLogin, userId } from "./helpers.js";

// Delivery phase 2, webhooks and statuses: the provider's signed events move the delivery on
// (the courier's pickup makes the order InDelivery, the delivery completes it), "delivered" and "failed" notify both sides, and
// after a failure before the pickup the restaurant switches to pickup or cancels.
const STORE = "delivery-webhooks-store@test.com";
const RESTAURANT = "delivery-webhooks-restaurant@test.com";
const ADMIN = "delivery-webhooks-admin@test.com";

let store: Agent;
let restaurant: Agent;
let storeId: number;
let restaurantId: number;

const mock = () => getDeliveryProvider() as MockProvider;

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  storeId = await userId(STORE);
  restaurantId = await userId(RESTAURANT);
  const sarajevo = await cityId("Sarajevo");
  // Sarajevo centre → Ilidža, inside the mock's zone (tests/cartDelivery.test.ts).
  await pool.query(
    "UPDATE users SET city_id = $2, address = 'Ferhadija 1', phone = '033000000', latitude = 43.8563, longitude = 18.4131 WHERE id = $1",
    [storeId, sarajevo],
  );
  await pool.query(
    "UPDATE users SET city_id = $2, address = 'Butmirska cesta 2', phone = '033111111', latitude = 43.8296, longitude = 18.3103 WHERE id = $1",
    [restaurantId, sarajevo],
  );
});

afterEach(async () => {
  await cleanupUsers([STORE, RESTAURANT, ADMIN]);
});

// A delivery order of 2 × 5 KM, accepted with a ready time in a few minutes: the mock created its
// delivery. Returns the order id and the provider's delivery id.
const acceptedDelivery = async () => {
  const product = await createProduct(store, { quantity: 10, discounted_price: 5 });
  await restaurant.put(`/api/cart/items/${product.id}`).send({ quantity: 2 });
  const sent = await restaurant.post("/api/orders").send({
    fulfilment_method: "DELIVERY",
    items: [{ product_id: product.id, quantity: 2, unit_price: 5 }],
  });
  expect(sent.status).toBe(201);
  const orderId = sent.body.order.id as number;
  const accepted = await store.post(`/api/orders/${orderId}/decision`).send({
    items: [{ item_id: sent.body.order.items[0].id, action: "ACCEPT" }],
    ready_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  expect(accepted.status).toBe(200);
  const row = await pool.query<{ provider_delivery_id: string }>(
    "SELECT provider_delivery_id FROM deliveries WHERE order_id = $1",
    [orderId],
  );
  return { orderId, productId: product.id, deliveryId: row.rows[0]!.provider_delivery_id };
};

const postWebhook = (webhook: SignedWebhook, provider = "mock") =>
  request(app)
    .post(`/api/delivery/webhooks/${provider}`)
    .set(webhook.headers)
    .set("Content-Type", "application/json")
    .send(webhook.rawBody);

// A fixed courier instead of the mock's random one.
const COURIER: Courier = {
  id: "courier_7",
  name: "Mock Kurir",
  phone: "+38761000000",
  photo_url: "http://localhost:5173/dev/couriers/courier-1.svg",
  vehicle: "BICYCLE",
};

const courier = (deliveryId: string, type: DeliveryEventType, options: SimulateOptions = {}) =>
  postWebhook(
    mock().simulate(deliveryId, type, type === "delivery.courier_assigned" ? { courier: COURIER, ...options } : options),
  );

const orderOf = async (orderId: number) => (await restaurant.get(`/api/orders/${orderId}`)).body.order;

const notificationTypes = async (id: number) =>
  (
    await pool.query<{ type: string }>("SELECT type FROM notifications WHERE user_id = $1 ORDER BY id", [id])
  ).rows.map((row) => row.type);

describe("POST /api/delivery/webhooks/:provider", () => {
  it("refuses a call without a valid signature, a broken body and another provider", async () => {
    const { deliveryId } = await acceptedDelivery();
    const webhook = mock().simulate(deliveryId, "delivery.courier_assigned");

    const unsigned = await request(app)
      .post("/api/delivery/webhooks/mock")
      .set("Content-Type", "application/json")
      .send(webhook.rawBody);
    expect(unsigned.status).toBe(401);
    expect(unsigned.body.code).toBe("INVALID_SIGNATURE");

    // The signature covers the exact bytes: a changed body no longer matches.
    const tampered = await postWebhook({
      ...webhook,
      rawBody: webhook.rawBody.replace("delivery.courier_assigned", "delivery.picked_up"),
    });
    expect(tampered.status).toBe(401);

    const broken = await postWebhook({ rawBody: "{}", headers: signWebhook("josvrijedi-mock-webhook-secret", "{}") });
    expect(broken.status).toBe(400);
    expect(broken.body.code).toBe("INVALID_EVENT");

    const other = await postWebhook(webhook, "korpa");
    expect(other.status).toBe(404);
    expect(other.body.error).toBe("Unknown delivery provider.");
  });

  it("follows the courier: assigned, picked up (in delivery), delivered (completed)", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();

    const assigned = await courier(deliveryId, "delivery.courier_assigned");
    expect(assigned.status).toBe(200);
    expect(assigned.body.outcome).toBe("APPLIED");
    let order = await orderOf(orderId);
    expect(order.status).toBe("Confirmed");
    expect(order.delivery).toMatchObject({
      status: "COURIER_ASSIGNED",
      courier_name: "Mock Kurir",
      courier_phone: "+38761000000",
      courier_photo_url: COURIER.photo_url,
      courier_vehicle: "BICYCLE",
      // The mock's tracking page (the client's dev page).
      tracking_url: `http://localhost:5173/dev/tracking/${deliveryId}`,
    });
    expect((await pool.query("SELECT courier_id FROM deliveries WHERE order_id = $1", [orderId])).rows[0].courier_id).toBe(
      "courier_7",
    );
    // When the courier was assigned (My orders shows it on the step).
    expect(order.delivery.courier_assigned_at).not.toBeNull();
    expect(order.delivery.failed_at).toBeNull();

    await courier(deliveryId, "delivery.picked_up");
    order = await orderOf(orderId);
    expect(order.status).toBe("InDelivery");
    expect(order.picked_up_at).not.toBeNull();
    expect(order.delivery.status).toBe("PICKED_UP");
    expect(order.delivery.picked_up_at).not.toBeNull();
    expect(order.items[0].status).toBe("InDelivery");
    expect(order.history.at(-1)).toMatchObject({ from_status: "Confirmed", to_status: "InDelivery", source: "PROVIDER" });
    // Still the restaurant's open order, already the store's history.
    const restaurantToday = await restaurant.get("/api/orders/pickups?scope=today");
    expect(restaurantToday.body.orders.map((o: { id: number }) => o.id)).toContain(orderId);
    const storeHistory = await store.get("/api/orders/pickups?scope=completed");
    expect(storeHistory.body.orders.map((o: { id: number }) => o.id)).toContain(orderId);
    expect((await restaurant.get("/api/orders/mine?scope=active")).body.orders.map((o: { id: number }) => o.id)).toContain(orderId);
    expect((await restaurant.get("/api/orders/mine/summary")).body.summary).toMatchObject({ active: 1, counts: { InDelivery: 1 } });
    // The pickup itself is not a notification.
    expect(await notificationTypes(restaurantId)).toEqual(["ORDER_ACCEPTED"]);

    await courier(deliveryId, "delivery.delivered");
    order = await orderOf(orderId);
    expect(order.status).toBe("Completed");
    expect(order.items[0].status).toBe("Completed");
    expect(order.history.at(-1)).toMatchObject({ from_status: "InDelivery", to_status: "Completed", source: "PROVIDER" });
    expect(order.delivery.status).toBe("DELIVERED");
    expect(order.delivery.delivered_at).not.toBeNull();
    expect(await notificationTypes(restaurantId)).toEqual(["ORDER_ACCEPTED", "DELIVERY_DELIVERED"]);
    expect(await notificationTypes(storeId)).toContain("DELIVERY_DELIVERED");
  });

  it("applies a repeated event once and ignores one that would move the delivery backwards", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    const assigned = mock().simulate(deliveryId, "delivery.courier_assigned");
    const pickedUp = mock().simulate(deliveryId, "delivery.picked_up");

    expect((await postWebhook(pickedUp)).body.outcome).toBe("APPLIED");
    expect((await postWebhook(pickedUp)).body.outcome).toBe("DUPLICATE");
    // "Courier assigned" arriving after the pickup is stored but changes nothing.
    expect((await postWebhook(assigned)).body.outcome).toBe("IGNORED");
    expect((await orderOf(orderId)).delivery.status).toBe("PICKED_UP");

    const events = await pool.query<{ type: string; applied: boolean }>(
      `SELECT delivery_events.type, delivery_events.applied FROM delivery_events
       JOIN deliveries ON deliveries.id = delivery_events.delivery_id
       WHERE deliveries.order_id = $1 ORDER BY delivery_events.id`,
      [orderId],
    );
    expect(events.rows).toEqual([
      { type: "delivery.picked_up", applied: true },
      { type: "delivery.courier_assigned", applied: false },
    ]);
  });

  it("answers 200 for a delivery it does not know", async () => {
    const { deliveryId } = await acceptedDelivery();
    const webhook = mock().simulate(deliveryId, "delivery.courier_assigned");
    const event = JSON.parse(webhook.rawBody);
    const rawBody = JSON.stringify({ ...event, delivery_id: "mock_dlv_unknown" });
    const response = await postWebhook({ rawBody, headers: signWebhook("josvrijedi-mock-webhook-secret", rawBody) });
    expect(response.status).toBe(200);
    expect(response.body.outcome).toBe("UNKNOWN_DELIVERY");
  });

  it("a failure after the pickup notifies both sides and keeps the order in delivery", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    await courier(deliveryId, "delivery.courier_assigned");
    await courier(deliveryId, "delivery.picked_up");
    await courier(deliveryId, "delivery.failed");
    const order = await orderOf(orderId);
    expect(order.status).toBe("InDelivery");
    expect(order.delivery).toMatchObject({
      status: "FAILED",
      failure_code: "OTHER",
      failure_reason: "The courier could not complete the delivery.",
      failed_after_pickup: true,
    });
    expect(await notificationTypes(restaurantId)).toEqual(["ORDER_ACCEPTED", "DELIVERY_FAILED_AFTER_PICKUP"]);
    expect(await notificationTypes(storeId)).toContain("DELIVERY_FAILED_AFTER_PICKUP");
    // The restaurant has nothing to choose any more.
    const switched = await restaurant.post(`/api/orders/${orderId}/switch-to-pickup`).send({ pickup_at: `${futureDate(1)}T10:00:00` });
    expect(switched.status).toBe(400);
  });

  it("an admin closes an order the courier took but did not deliver, without putting it back on offer", async () => {
    const { orderId, productId, deliveryId } = await acceptedDelivery();
    await courier(deliveryId, "delivery.courier_assigned");
    await courier(deliveryId, "delivery.picked_up");
    await courier(deliveryId, "delivery.failed");
    const before = await restaurant.get(`/api/products/${productId}`);
    expect(Number(before.body.product.available_quantity)).toBe(8);

    const admin = await registerAndLogin(ADMIN, "ADMIN");
    const response = await admin.post(`/api/admin/orders/${orderId}/cancel`).send({ reason: "Roba izgubljena" });
    expect(response.status).toBe(200);

    const order = await orderOf(orderId);
    expect(order.status).toBe("Cancelled");
    const after = await restaurant.get(`/api/products/${productId}`);
    expect(Number(after.body.product.available_quantity)).toBe(8);
    expect(Number(after.body.product.quantity)).toBe(8);
  });
});

describe("the provider's estimates and failure codes", () => {
  it("stores every new estimate on the delivery and the order, and keeps each one in the history", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    await courier(deliveryId, "delivery.courier_assigned");
    const assigned = (await orderOf(orderId)).delivery;
    const moved = await courier(deliveryId, "delivery.estimate_updated", { minutes: 5 });
    expect(moved.body.outcome).toBe("APPLIED");
    const order = await orderOf(orderId);
    expect(order.status).toBe("Confirmed");
    expect(order.delivery.status).toBe("COURIER_ASSIGNED");
    expect(new Date(order.delivery.estimated_delivery_at).getTime() - new Date(assigned.estimated_delivery_at).getTime()).toBe(
      5 * 60_000,
    );
    // The order's arrival follows the provider; its handover time is the courier's pickup.
    expect(new Date(order.delivery_estimated_at).toISOString()).toBe(new Date(order.delivery.estimated_delivery_at).toISOString());
    const local = await pool.query<{ same: boolean }>(
      "SELECT orders.pickup_at = (deliveries.estimated_pickup_at AT TIME ZONE current_setting('TimeZone')) AS same FROM orders JOIN deliveries ON deliveries.order_id = orders.id WHERE orders.id = $1",
      [orderId],
    );
    expect(local.rows[0]!.same).toBe(true);

    await courier(deliveryId, "delivery.estimate_updated", { minutes: -5 });
    const history = await pool.query<{ type: string; estimated_delivery_at: Date }>(
      `SELECT delivery_events.type, delivery_events.estimated_delivery_at FROM delivery_events
       JOIN deliveries ON deliveries.id = delivery_events.delivery_id
       WHERE deliveries.order_id = $1 ORDER BY delivery_events.id`,
      [orderId],
    );
    expect(history.rows.map((row) => row.type)).toEqual([
      "delivery.courier_assigned",
      "delivery.estimate_updated",
      "delivery.estimate_updated",
    ]);
    const arrivals = history.rows.map((row) => row.estimated_delivery_at.getTime());
    expect(arrivals[1]! - arrivals[0]!).toBe(5 * 60_000);
    expect(arrivals[2]).toBe(arrivals[0]);
  });

  it("an estimate after the delivery closed changes nothing", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    const late = mock().simulate(deliveryId, "delivery.estimate_updated", { minutes: 10 });
    await courier(deliveryId, "delivery.failed");
    const before = (await orderOf(orderId)).delivery.estimated_delivery_at;
    expect((await postWebhook(late)).body.outcome).toBe("IGNORED");
    expect((await orderOf(orderId)).delivery.estimated_delivery_at).toBe(before);
  });

  it("keeps every failure code with the provider's text, before and after the pickup", async () => {
    for (const code of DELIVERY_FAILURE_CODES) {
      const before = await acceptedDelivery();
      await courier(before.deliveryId, "delivery.failed", { failureCode: code });
      expect((await orderOf(before.orderId)).delivery).toMatchObject({
        status: "FAILED",
        failure_code: code,
        failure_reason: expect.any(String),
        failed_after_pickup: false,
      });
      const after = await acceptedDelivery();
      await courier(after.deliveryId, "delivery.courier_assigned");
      await courier(after.deliveryId, "delivery.picked_up");
      await courier(after.deliveryId, "delivery.failed", { failureCode: code });
      const order = await orderOf(after.orderId);
      expect(order.status).toBe("InDelivery");
      expect(order.delivery).toMatchObject({ failure_code: code, failed_after_pickup: true });
    }
  });
});

describe("after a failure before the pickup", () => {
  const failedDelivery = async (type: "delivery.failed" | "delivery.cancelled" = "delivery.failed") => {
    const accepted = await acceptedDelivery();
    await courier(accepted.deliveryId, "delivery.courier_assigned");
    expect((await courier(accepted.deliveryId, type)).body.outcome).toBe("APPLIED");
    return accepted;
  };

  it("notifies both sides and keeps the order accepted", async () => {
    const { orderId } = await failedDelivery();
    const order = await orderOf(orderId);
    expect(order.status).toBe("Confirmed");
    expect(order.delivery.status).toBe("FAILED");
    expect(order.delivery.failed_at).not.toBeNull();
    expect(order.delivery.picked_up_at).toBeNull();
    expect(await notificationTypes(restaurantId)).toEqual(["ORDER_ACCEPTED", "DELIVERY_FAILED"]);
    expect(await notificationTypes(storeId)).toContain("DELIVERY_FAILED");
  });

  it("the restaurant switches to pickup at a time it chooses", async () => {
    const { orderId } = await failedDelivery("delivery.cancelled");
    expect((await orderOf(orderId)).delivery).toMatchObject({
      status: "CANCELLED",
      failure_code: "CANCELLED_BY_SERVICE",
      failure_reason: "The delivery service cancelled the delivery.",
      failed_after_pickup: false,
    });

    const invalid = await restaurant.post(`/api/orders/${orderId}/switch-to-pickup`).send({ pickup_at: "soon" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("Pickup date is not valid.");
    const tooLate = await restaurant
      .post(`/api/orders/${orderId}/switch-to-pickup`)
      .send({ pickup_at: `${futureDate(400)}T10:00:00` });
    expect(tooLate.status).toBe(400);
    expect(tooLate.body.error).toBe("Pickup date must be between today and the products' expiry date.");
    expect((await store.post(`/api/orders/${orderId}/switch-to-pickup`).send({})).status).toBe(403);

    const pickupAt = `${futureDate(1)}T10:00:00`;
    const response = await restaurant.post(`/api/orders/${orderId}/switch-to-pickup`).send({ pickup_at: pickupAt });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Order switched to pickup.");
    const order = await orderOf(orderId);
    expect(order).toMatchObject({ status: "Confirmed", fulfilment_method: "PICKUP" });
    expect(order.delivery.status).toBe("CANCELLED");
    expect(await notificationTypes(storeId)).toContain("ORDER_SWITCHED_TO_PICKUP");

    // Now it is an ordinary pickup the store hands over.
    const completed = await store.post(`/api/orders/${orderId}/complete`);
    expect(completed.status).toBe(200);
  });

  it("the restaurant cancels it and the quantity goes back on offer", async () => {
    const { orderId, productId } = await failedDelivery();
    const response = await restaurant.post(`/api/orders/${orderId}/cancel-failed-delivery`);
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Order cancelled.");
    const order = await orderOf(orderId);
    expect(order.status).toBe("Cancelled");
    expect(order.history.at(-1)).toMatchObject({ to_status: "Cancelled", source: "RESTAURANT" });
    expect(await notificationTypes(storeId)).toContain("ORDER_CANCELLED_DELIVERY_FAILED");
    const product = await store.get(`/api/products/${productId}`);
    expect(Number(product.body.product.available_quantity)).toBe(10);
  });

  it("is not possible while the courier is coming, or for another restaurant", async () => {
    const { orderId } = await acceptedDelivery();
    const cancel = await restaurant.post(`/api/orders/${orderId}/cancel-failed-delivery`);
    expect(cancel.status).toBe(400);
    expect(cancel.body.error).toBe("Only an accepted order whose delivery failed can be cancelled.");
    const switched = await restaurant.post(`/api/orders/${orderId}/switch-to-pickup`).send({ pickup_at: `${futureDate(1)}T10:00:00` });
    expect(switched.status).toBe(400);
    expect(switched.body.error).toBe("Only an accepted order whose delivery failed can be switched to pickup.");
    const other = await registerAndLogin("delivery-webhooks-other@test.com", "RESTAURANT");
    try {
      expect((await other.post(`/api/orders/${orderId}/cancel-failed-delivery`)).status).toBe(404);
    } finally {
      await cleanupUsers(["delivery-webhooks-other@test.com"]);
    }
  });

  it("also applies when the delivery could not be created at all", async () => {
    const product = await createProduct(store, { quantity: 10, discounted_price: 5 });
    await restaurant.put(`/api/cart/items/${product.id}`).send({ quantity: 1 });
    const sent = await restaurant.post("/api/orders").send({
      fulfilment_method: "DELIVERY",
      items: [{ product_id: product.id, quantity: 1, unit_price: 5 }],
    });
    // The store's pin is gone by the time it accepts.
    await pool.query("UPDATE users SET latitude = NULL, longitude = NULL WHERE id = $1", [storeId]);
    await store.post(`/api/orders/${sent.body.order.id}/decision`).send({
      items: [{ item_id: sent.body.order.items[0].id, action: "ACCEPT" }],
      ready_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    // The failure is timed when it was recorded.
    expect((await orderOf(sent.body.order.id)).delivery).toMatchObject({ status: "FAILED", failed_at: expect.any(String) });
    const response = await restaurant.post(`/api/orders/${sent.body.order.id}/cancel-failed-delivery`);
    expect(response.status).toBe(200);
  });
});

describe("delivery orders and the store's pickup actions", () => {
  it("the store cannot mark a delivery order picked up, and it is never late", async () => {
    const { orderId } = await acceptedDelivery();
    const response = await store.post(`/api/orders/${orderId}/complete`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("A delivery order is completed when the courier delivers it.");

    await pool.query("UPDATE orders SET pickup_at = pickup_at - INTERVAL '2 days' WHERE id = $1", [orderId]);
    expect((await orderOf(orderId)).is_overdue).toBe(false);
    expect((await store.get("/api/orders/pickups/counts")).body.counts.overdue).toBe(0);
    expect((await store.post(`/api/orders/${orderId}/cancel-overdue`)).status).toBe(400);
  });

  it("an admin's cancel also cancels the delivery with the provider", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    const response = await admin.post(`/api/admin/orders/${orderId}/cancel`).send({ reason: "Spor oko narudžbe" });
    expect(response.status).toBe(200);
    expect((await orderOf(orderId)).delivery).toMatchObject({
      status: "CANCELLED",
      failure_reason: "CANCELLED_BY_ADMIN",
      failed_at: expect.any(String),
    });
    expect((await mock().getDelivery(deliveryId)).status).toBe("CANCELLED");
  });
});

describe("POST /api/delivery/mock/orders/:id/simulate", () => {
  it("plays the courier through the webhook for either party", async () => {
    const { orderId } = await acceptedDelivery();
    const assigned = await store.post(`/api/delivery/mock/orders/${orderId}/simulate`).send({ event: "courier_assigned" });
    expect(assigned.status).toBe(200);
    expect(assigned.body.message).toBe("Courier step simulated.");
    expect(assigned.body.order.delivery.status).toBe("COURIER_ASSIGNED");

    const pickedUp = await restaurant.post(`/api/delivery/mock/orders/${orderId}/simulate`).send({ event: "picked_up" });
    expect(pickedUp.body.order.status).toBe("InDelivery");

    const again = await restaurant.post(`/api/delivery/mock/orders/${orderId}/simulate`).send({ event: "courier_assigned" });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("This courier step is not possible now.");
    const invalid = await restaurant.post(`/api/delivery/mock/orders/${orderId}/simulate`).send({ event: "teleport" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("This courier step is not valid.");
  });

  it("assigns a courier with or without a photo, moves the arrival and fails with a code", async () => {
    const { orderId } = await acceptedDelivery();
    const simulate = (body: object) => restaurant.post(`/api/delivery/mock/orders/${orderId}/simulate`).send(body);
    for (const body of [
      { event: "courier_assigned", photo: "yes" },
      { event: "failed", failure_code: "LOST" },
      { event: "estimate" },
      { event: "estimate", minutes: 0 },
      { event: "estimate", minutes: 2.5 },
      { event: "estimate", minutes: 500 },
    ]) {
      const response = await simulate(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error).toBe("This courier step is not valid.");
    }
    const assigned = await simulate({ event: "courier_assigned", photo: false });
    expect(assigned.body.order.delivery).toMatchObject({ courier_photo_url: null, tracking_url: expect.stringContaining("/dev/tracking/") });
    expect(["BICYCLE", "SCOOTER", "CAR"]).toContain(assigned.body.order.delivery.courier_vehicle);
    expect(assigned.body.order.delivery.courier_name).toEqual(expect.any(String));
    const arrival = new Date(assigned.body.order.delivery.estimated_delivery_at).getTime();
    const later = await simulate({ event: "estimate", minutes: 5 });
    expect(later.status).toBe(200);
    expect(new Date(later.body.order.delivery.estimated_delivery_at).getTime()).toBe(arrival + 5 * 60_000);
    const earlier = await simulate({ event: "estimate", minutes: -5 });
    expect(new Date(earlier.body.order.delivery.estimated_delivery_at).getTime()).toBe(arrival);
    const failed = await simulate({ event: "failed", failure_code: "RECIPIENT_CLOSED" });
    expect(failed.body.order.delivery).toMatchObject({
      status: "FAILED",
      failure_code: "RECIPIENT_CLOSED",
      failure_reason: "The restaurant was closed when the courier arrived.",
    });
    expect((await simulate({ event: "estimate", minutes: 5 })).status).toBe(409);
  });

  it("goes on with a delivery the mock forgot after a restart", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    // A fresh mock, as after a server restart.
    (mock() as unknown as { deliveries: Map<string, unknown> }).deliveries.delete(deliveryId);
    const response = await store.post(`/api/delivery/mock/orders/${orderId}/simulate`).send({ event: "courier_assigned" });
    expect(response.status).toBe(200);
    expect(response.body.order.delivery.status).toBe("COURIER_ASSIGNED");
  });

  it("is only for the order's parties and an order with a delivery", async () => {
    const { orderId } = await acceptedDelivery();
    const other = await registerAndLogin("delivery-webhooks-other@test.com", "STORE");
    try {
      expect((await other.post(`/api/delivery/mock/orders/${orderId}/simulate`).send({ event: "picked_up" })).status).toBe(404);
    } finally {
      await cleanupUsers(["delivery-webhooks-other@test.com"]);
    }
    await pool.query("DELETE FROM deliveries WHERE order_id = $1", [orderId]);
    const none = await store.post(`/api/delivery/mock/orders/${orderId}/simulate`).send({ event: "picked_up" });
    expect(none.status).toBe(409);
    expect(none.body.error).toBe("This order has no delivery to simulate.");
  });
});

describe("GET /api/delivery/mock/deliveries/:deliveryId (the dev tracking page)", () => {
  it("shows the courier, the status, the estimates, the history and the ratings to the parties and admins", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    await courier(deliveryId, "delivery.courier_assigned");
    await courier(deliveryId, "delivery.picked_up");
    await courier(deliveryId, "delivery.estimate_updated", { minutes: 5 });
    await courier(deliveryId, "delivery.delivered");
    expect((await restaurant.post(`/api/orders/${orderId}/courier-rating`).send({ rating: 4, comment: "OK" })).status).toBe(201);

    const response = await restaurant.get(`/api/delivery/mock/deliveries/${deliveryId}`);
    expect(response.status).toBe(200);
    expect(response.body.delivery).toMatchObject({
      delivery_id: deliveryId,
      order_id: orderId,
      status: "DELIVERED",
      courier_name: "Mock Kurir",
      courier_vehicle: "BICYCLE",
      courier_photo_url: COURIER.photo_url,
      store_name: "Test Business",
    });
    expect(response.body.delivery.store_id).toBeUndefined();
    expect(response.body.history.map((event: { type: string }) => event.type)).toEqual([
      "delivery.courier_assigned",
      "delivery.picked_up",
      "delivery.estimate_updated",
      "delivery.delivered",
    ]);
    expect(response.body.history[2].estimated_delivery_at).toEqual(expect.any(String));
    expect(response.body.ratings).toEqual([{ rating: 4, comment: "OK", received_at: expect.any(String) }]);

    expect((await store.get(`/api/delivery/mock/deliveries/${deliveryId}`)).status).toBe(200);
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    expect((await admin.get(`/api/delivery/mock/deliveries/${deliveryId}`)).status).toBe(200);
    const other = await registerAndLogin("delivery-webhooks-other@test.com", "RESTAURANT");
    try {
      const refused = await other.get(`/api/delivery/mock/deliveries/${deliveryId}`);
      expect(refused.status).toBe(404);
      expect(refused.body.error).toBe("Delivery not found.");
    } finally {
      await cleanupUsers(["delivery-webhooks-other@test.com"]);
    }
    expect((await restaurant.get("/api/delivery/mock/deliveries/mock_dlv_unknown")).status).toBe(404);
  });
});
