import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { getDeliveryProvider } from "../src/delivery/config.js";
import { MockProvider, type SimulateOptions } from "../src/delivery/mock.js";
import type { Courier, DeliveryEventType } from "../src/delivery/types.js";
import { autoRejectOrders } from "../src/jobs/autoRejectOrders.js";
import {
  type Agent,
  acceptItem,
  cityId,
  cleanupUsers,
  createProduct,
  futureDate,
  orderOf,
  orderOne,
  registerAndLogin,
  rejectItem,
  userId,
} from "./helpers.js";

// GET /orders/:id for the order page's redesign: the times of every step (from the order, its
// history and its delivery), the courier, the exact estimates, the failure, the store's contact
// details, and the restaurant's problem reports and courier rating, in every state of an order.
const STORE = "order-steps-store@test.com";
const RESTAURANT = "order-steps-restaurant@test.com";
const ADMIN = "order-steps-admin@test.com";

let store: Agent;
let restaurant: Agent;
let storeId: number;
let restaurantId: number;

const COURIER: Courier = {
  id: "courier_9",
  name: "Selma Mehmedović",
  phone: "+38762000000",
  photo_url: "http://localhost:5173/dev/couriers/courier-2.svg",
  vehicle: "CAR",
};

const mock = () => getDeliveryProvider() as MockProvider;

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  storeId = await userId(STORE);
  restaurantId = await userId(RESTAURANT);
  const sarajevo = await cityId("Sarajevo");
  const hours = { mon: [{ from: "08:00", to: "20:00" }] };
  await pool.query(
    `UPDATE users SET city_id = $2, address = 'Ferhadija 1', phone = '033000000', latitude = 43.8563, longitude = 18.4131,
       pickup_schedule = $3 WHERE id = $1`,
    [storeId, sarajevo, JSON.stringify(hours)],
  );
  await pool.query(
    "UPDATE users SET city_id = $2, address = 'Butmirska cesta 2', phone = '033111111', latitude = 43.8296, longitude = 18.3103 WHERE id = $1",
    [restaurantId, sarajevo],
  );
});

afterEach(async () => {
  await cleanupUsers([STORE, RESTAURANT, ADMIN]);
});

const details = async (orderId: number, agent: Agent = restaurant) => {
  const response = await agent.get(`/api/orders/${orderId}`);
  expect(response.status).toBe(200);
  return response.body.order;
};

const pickupOrder = async () => {
  const product = await createProduct(store, { quantity: 10, discounted_price: 5 });
  const itemId = await orderOne(restaurant, product.id, 2);
  return { itemId, orderId: await orderOf(itemId) };
};

// A delivery order of 2 × 5 KM, accepted with a ready time in a few minutes.
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
  return { orderId, deliveryId: row.rows[0]!.provider_delivery_id };
};

const courier = async (deliveryId: string, type: DeliveryEventType, options: SimulateOptions = {}) => {
  const webhook = mock().simulate(deliveryId, type, type === "delivery.courier_assigned" ? { courier: COURIER } : options);
  const response = await request(app)
    .post("/api/delivery/webhooks/mock")
    .set(webhook.headers)
    .set("Content-Type", "application/json")
    .send(webhook.rawBody);
  expect(response.body.outcome).toBe("APPLIED");
};

const NO_STEPS = {
  courier_assigned_at: null,
  courier_picked_up_at: null,
  delivered_at: null,
  delivery_failed_at: null,
  switched_to_pickup_at: null,
  picked_up_at: null,
  cancelled_at: null,
  cancelled_by: null,
  finished_at: null,
};

describe("GET /api/orders/:id steps and new fields", () => {
  it("pending: sent, the answer deadline, problems can be reported, nothing to rate", async () => {
    const { orderId } = await pickupOrder();
    const order = await details(orderId);
    expect(order.steps).toMatchObject({ ...NO_STEPS, decision: null, decided_at: null });
    expect(new Date(order.steps.sent_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(order.auto_reject_at).not.toBeNull();
    expect(order).toMatchObject({
      problems: [],
      courier_rating: null,
      can_report_problem: true,
      problem_report_until: null,
      can_rate_courier: false,
      courier_rating_until: null,
    });
    // The store's address, city, phone and pickup hours.
    expect(order.store).toMatchObject({
      address: "Ferhadija 1",
      city: "Sarajevo",
      phone: "033000000",
      pickup_schedule: { mon: [{ from: "08:00", to: "20:00" }] },
    });
  });

  it("accepted and then picked up at the store", async () => {
    const { itemId, orderId } = await pickupOrder();
    await acceptItem(store, itemId);
    let order = await details(orderId);
    expect(order.steps).toMatchObject({ ...NO_STEPS, decision: "ACCEPTED", decided_at: expect.any(String) });
    expect(order.auto_reject_at).toBeNull();

    expect((await store.post(`/api/orders/${orderId}/complete`)).status).toBe(200);
    order = await details(orderId);
    expect(order.steps).toMatchObject({
      decision: "ACCEPTED",
      picked_up_at: expect.any(String),
      finished_at: expect.any(String),
      cancelled_at: null,
    });
    // 48 hours from the finish.
    expect(new Date(order.problem_report_until).getTime() - new Date(order.steps.finished_at).getTime()).toBe(
      48 * 60 * 60 * 1000,
    );
    expect(order.can_report_problem).toBe(true);
    expect(order.can_rate_courier).toBe(false);
  });

  it("partially accepted: per item the ordered and accepted quantity, status and reason, and both totals", async () => {
    const first = await createProduct(store, { quantity: 10, discounted_price: 5 });
    const second = await createProduct(store, { quantity: 10, discounted_price: 2 });
    const sent = await restaurant.post("/api/orders").send({
      pickup_at: `${futureDate(1)}T10:00:00`,
      items: [
        { product_id: first.id, quantity: 4, unit_price: 5 },
        { product_id: second.id, quantity: 3, unit_price: 2 },
      ],
    });
    const [a, b] = sent.body.order.items as { id: number; product_id: number }[];
    const decided = await store.post(`/api/orders/${sent.body.order.id}/decision`).send({
      items: [
        { item_id: a!.id, action: "ACCEPT_LESS", quantity: 2, reason: "NOT_ENOUGH_STOCK" },
        { item_id: b!.id, action: "REJECT", reason: "QUALITY" },
      ],
    });
    expect(decided.status).toBe(200);
    const order = await details(sent.body.order.id);
    expect(order.steps.decision).toBe("PARTIALLY_ACCEPTED");
    expect(Number(order.ordered_total)).toBe(26);
    expect(Number(order.total)).toBe(10);
    expect(order.is_partial).toBe(true);
    expect(Number(order.items[0].ordered_quantity)).toBe(4);
    expect(Number(order.items[0].quantity)).toBe(2);
    expect(order.items).toEqual([
      expect.objectContaining({ status: "Confirmed", change_reason: "NOT_ENOUGH_STOCK" }),
      expect.objectContaining({ status: "Rejected", change_reason: "QUALITY" }),
    ]);
  });

  it("rejected by the store, or automatically", async () => {
    const rejected = await pickupOrder();
    await rejectItem(store, rejected.itemId);
    const byStore = await details(rejected.orderId);
    expect(byStore.steps).toMatchObject({ decision: "REJECTED", decided_at: expect.any(String), finished_at: expect.any(String) });

    const late = await pickupOrder();
    await pool.query("UPDATE orders SET pickup_at = LOCALTIMESTAMP - INTERVAL '1 minute' WHERE id = $1", [late.orderId]);
    expect(await autoRejectOrders()).toBe(1);
    const auto = await details(late.orderId);
    expect(auto.steps).toMatchObject({ decision: "AUTO_REJECTED", decided_at: expect.any(String) });
    expect(auto.steps.decided_at).toBe(auto.steps.finished_at);
  });

  it("cancelled: when and by whom", async () => {
    const own = await pickupOrder();
    expect((await restaurant.post(`/api/orders/${own.orderId}/cancel`)).status).toBe(200);
    const byRestaurant = await details(own.orderId);
    expect(byRestaurant.steps).toMatchObject({ cancelled_at: expect.any(String), cancelled_by: "RESTAURANT", decision: null });

    const other = await pickupOrder();
    await acceptItem(store, other.itemId);
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    expect((await admin.post(`/api/admin/orders/${other.orderId}/cancel`).send({ reason: "Spor" })).status).toBe(200);
    const byAdmin = await details(other.orderId);
    expect(byAdmin.steps).toMatchObject({ decision: "ACCEPTED", cancelled_by: "ADMIN", cancelled_at: expect.any(String) });
  });

  it("a delivery: accepted, courier assigned, picked up, delivered, with the courier and the exact estimates", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    let order = await details(orderId);
    expect(order.steps).toMatchObject({ ...NO_STEPS, decision: "ACCEPTED" });
    expect(order.delivery).toMatchObject({
      status: "CREATED",
      price: expect.any(String),
      cash_to_collect: expect.any(String),
      ready_at: expect.any(String),
      estimated_pickup_at: expect.any(String),
      estimated_delivery_at: expect.any(String),
      tracking_url: null,
    });
    expect(Number(order.delivery.cash_to_collect)).toBeCloseTo(10 + Number(order.delivery.price));

    await courier(deliveryId, "delivery.courier_assigned");
    order = await details(orderId);
    expect(order.steps.courier_assigned_at).toEqual(expect.any(String));
    expect(order.delivery).toMatchObject({
      status: "COURIER_ASSIGNED",
      courier_name: COURIER.name,
      courier_phone: COURIER.phone,
      courier_photo_url: COURIER.photo_url,
      courier_vehicle: "CAR",
      tracking_url: `http://localhost:5173/dev/tracking/${deliveryId}`,
    });

    await courier(deliveryId, "delivery.picked_up");
    order = await details(orderId);
    expect(order.status).toBe("InDelivery");
    expect(order.steps).toMatchObject({ courier_picked_up_at: expect.any(String), delivered_at: null, finished_at: null });

    await courier(deliveryId, "delivery.delivered");
    order = await details(orderId);
    expect(order.status).toBe("Completed");
    expect(order.steps).toMatchObject({ delivered_at: expect.any(String), finished_at: expect.any(String), picked_up_at: null });
    expect(order.can_rate_courier).toBe(true);
    expect(new Date(order.courier_rating_until).getTime() - new Date(order.steps.delivered_at).getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("a delivery that failed before the pickup and was switched to pickup", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    await courier(deliveryId, "delivery.failed", { failureCode: "NO_COURIER" });
    let order = await details(orderId);
    expect(order.steps.delivery_failed_at).toEqual(expect.any(String));
    expect(order.delivery).toMatchObject({
      status: "FAILED",
      failure_code: "NO_COURIER",
      failure_reason: "No courier was available.",
      failed_after_pickup: false,
    });

    const switched = await restaurant.post(`/api/orders/${orderId}/switch-to-pickup`).send({ pickup_at: `${futureDate(1)}T10:00:00` });
    expect(switched.status).toBe(200);
    order = await details(orderId);
    expect(order.fulfilment_method).toBe("PICKUP");
    expect(order.steps.switched_to_pickup_at).toEqual(expect.any(String));
    expect(order.can_rate_courier).toBe(false);
  });

  it("a delivery that failed after the pickup", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    await courier(deliveryId, "delivery.courier_assigned");
    await courier(deliveryId, "delivery.picked_up");
    await courier(deliveryId, "delivery.failed", { failureCode: "RECIPIENT_CLOSED" });
    const order = await details(orderId);
    expect(order.status).toBe("InDelivery");
    expect(order.steps).toMatchObject({
      courier_picked_up_at: expect.any(String),
      delivery_failed_at: expect.any(String),
      finished_at: null,
    });
    expect(order.delivery).toMatchObject({ failure_code: "RECIPIENT_CLOSED", failed_after_pickup: true });
  });

  it("the store never sees the restaurant's reports or rating; the admin sees them but cannot act", async () => {
    const { orderId, deliveryId } = await acceptedDelivery();
    await courier(deliveryId, "delivery.courier_assigned");
    await courier(deliveryId, "delivery.picked_up");
    await courier(deliveryId, "delivery.delivered");
    expect((await restaurant.post(`/api/orders/${orderId}/problems`).send({ reason: "LATE" })).status).toBe(201);
    expect((await restaurant.post(`/api/orders/${orderId}/courier-rating`).send({ rating: 5 })).status).toBe(201);

    const forRestaurant = await details(orderId);
    expect(forRestaurant.problems).toEqual([expect.objectContaining({ reason: "LATE", status: "OPEN", text: null })]);
    expect(forRestaurant.courier_rating).toMatchObject({ rating: 5, comment: null, courier_name: COURIER.name });
    expect(forRestaurant.can_rate_courier).toBe(false);

    const forStore = await details(orderId, store);
    for (const key of ["problems", "courier_rating", "can_report_problem", "problem_report_until", "can_rate_courier", "courier_rating_until"]) {
      expect(forStore).not.toHaveProperty(key);
    }
    expect(forStore.steps.delivered_at).toEqual(expect.any(String));

    const admin = await registerAndLogin(ADMIN, "ADMIN");
    const forAdmin = (await admin.get(`/api/admin/orders/${orderId}`)).body.order;
    expect(forAdmin.problems).toHaveLength(1);
    expect(forAdmin.courier_rating).toMatchObject({ rating: 5 });
    expect(forAdmin).toMatchObject({ can_report_problem: false, can_rate_courier: false });
  });
});
