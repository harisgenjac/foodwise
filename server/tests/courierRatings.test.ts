import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { getDeliveryProvider } from "../src/delivery/config.js";
import { MockProvider } from "../src/delivery/mock.js";
import type { DeliveryEventType } from "../src/delivery/types.js";
import { MAX_RATING_ATTEMPTS, retryCourierRatings } from "../src/services/courierRatings.js";
import {
  type Agent,
  acceptItem,
  cityId,
  cleanupUsers,
  createProduct,
  orderOf,
  orderOne,
  registerAndLogin,
  userId,
} from "./helpers.js";

// Courier ratings: only the restaurant of a delivered delivery order, once, within 7 days of the
// delivery; stored, sent to the provider (rateCourier), and retried when the provider fails.
const STORE = "courier-ratings-store@test.com";
const RESTAURANT = "courier-ratings-restaurant@test.com";
const OTHER = "courier-ratings-other@test.com";
const ADMIN = "courier-ratings-admin@test.com";

let store: Agent;
let restaurant: Agent;

const mock = () => getDeliveryProvider() as MockProvider;

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  const sarajevo = await cityId("Sarajevo");
  await pool.query(
    "UPDATE users SET city_id = $2, address = 'Ferhadija 1', phone = '033000000', latitude = 43.8563, longitude = 18.4131 WHERE id = $1",
    [await userId(STORE), sarajevo],
  );
  await pool.query(
    "UPDATE users SET city_id = $2, address = 'Butmirska cesta 2', phone = '033111111', latitude = 43.8296, longitude = 18.3103 WHERE id = $1",
    [await userId(RESTAURANT), sarajevo],
  );
});

afterEach(async () => {
  mock().failNextRatings(0);
  await cleanupUsers([STORE, RESTAURANT, OTHER, ADMIN]);
});

const step = async (deliveryId: string, type: DeliveryEventType) => {
  const webhook = mock().simulate(deliveryId, type);
  await request(app)
    .post("/api/delivery/webhooks/mock")
    .set(webhook.headers)
    .set("Content-Type", "application/json")
    .send(webhook.rawBody);
};

// A delivery order accepted by the store, and (by default) delivered by the courier.
const deliveryOrder = async (until: DeliveryEventType[] = ["delivery.courier_assigned", "delivery.picked_up", "delivery.delivered"]) => {
  const product = await createProduct(store, { quantity: 10, discounted_price: 5 });
  await restaurant.put(`/api/cart/items/${product.id}`).send({ quantity: 1 });
  const sent = await restaurant.post("/api/orders").send({
    fulfilment_method: "DELIVERY",
    items: [{ product_id: product.id, quantity: 1, unit_price: 5 }],
  });
  const orderId = sent.body.order.id as number;
  await store.post(`/api/orders/${orderId}/decision`).send({
    items: [{ item_id: sent.body.order.items[0].id, action: "ACCEPT" }],
    ready_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  const deliveryId = (await pool.query("SELECT provider_delivery_id FROM deliveries WHERE order_id = $1", [orderId])).rows[0]
    .provider_delivery_id as string;
  for (const type of until) await step(deliveryId, type);
  return { orderId, deliveryId };
};

const rate = (orderId: number, body: object, agent: Agent = restaurant) => agent.post(`/api/orders/${orderId}/courier-rating`).send(body);

const stored = async (orderId: number) =>
  (
    await pool.query(
      "SELECT rating, comment, courier_id, courier_name, sent_at, attempts, last_error FROM courier_ratings WHERE order_id = $1",
      [orderId],
    )
  ).rows[0];

describe("POST /api/orders/:id/courier-rating", () => {
  it("stores the rating with the courier and sends it to the provider", async () => {
    const { orderId, deliveryId } = await deliveryOrder();
    const courierName = (await pool.query("SELECT courier_name FROM deliveries WHERE order_id = $1", [orderId])).rows[0].courier_name;
    const response = await rate(orderId, { rating: 5, comment: "  Brz i ljubazan.  " });
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Courier rated.");
    expect(response.body.rating).toMatchObject({ rating: 5, comment: "Brz i ljubazan.", courier_name: courierName, sent_at: expect.any(String) });
    expect(await stored(orderId)).toMatchObject({ courier_id: expect.stringMatching(/^mock_courier_/), attempts: 1, last_error: null });
    expect(mock().ratingsFor(deliveryId)).toEqual([{ rating: 5, comment: "Brz i ljubazan.", received_at: expect.any(String) }]);
    // The admin's order page shows it.
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    expect((await admin.get(`/api/admin/orders/${orderId}`)).body.order.courier_rating).toMatchObject({
      rating: 5,
      comment: "Brz i ljubazan.",
    });
  });

  it("is possible only once", async () => {
    const { orderId } = await deliveryOrder();
    expect((await rate(orderId, { rating: 4 })).status).toBe(201);
    const again = await rate(orderId, { rating: 1 });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("The courier of this order has already been rated.");
    expect((await stored(orderId)).rating).toBe(4);
  });

  it("validates the rating and the comment", async () => {
    const { orderId } = await deliveryOrder();
    for (const rating of [0, 6, 3.5, "5", null, undefined]) {
      const response = await rate(orderId, { rating });
      expect(response.status, String(rating)).toBe(400);
      expect(response.body.error).toBe("The rating must be a whole number from 1 to 5.");
    }
    for (const comment of ["x".repeat(501), 12]) {
      const response = await rate(orderId, { rating: 3, comment });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("The comment can be at most 500 characters long.");
    }
    expect((await rate(orderId, { rating: 3, comment: "x".repeat(500) })).status).toBe(201);
  });

  it("is only for a delivered delivery order", async () => {
    const notYet = await deliveryOrder(["delivery.courier_assigned", "delivery.picked_up"]);
    const inDelivery = await rate(notYet.orderId, { rating: 5 });
    expect(inDelivery.status).toBe(400);
    expect(inDelivery.body.error).toBe("Only the courier of a delivered order can be rated.");
    const failed = await deliveryOrder(["delivery.failed"]);
    expect((await rate(failed.orderId, { rating: 2 })).status).toBe(400);

    const product = await createProduct(store, { quantity: 5 });
    const itemId = await orderOne(restaurant, product.id, 1);
    await acceptItem(store, itemId);
    const pickupId = await orderOf(itemId);
    expect((await store.post(`/api/orders/${pickupId}/complete`)).status).toBe(200);
    expect((await rate(pickupId, { rating: 5 })).status).toBe(400);
  });

  it("is only for the order's restaurant", async () => {
    const { orderId } = await deliveryOrder();
    expect((await rate(orderId, { rating: 5 }, store)).status).toBe(403);
    const other = await registerAndLogin(OTHER, "RESTAURANT");
    const refused = await rate(orderId, { rating: 5 }, other);
    expect(refused.status).toBe(404);
    expect(refused.body.error).toBe("Order not found.");
  });

  it("is possible within 7 days of the delivery", async () => {
    const { orderId } = await deliveryOrder();
    await pool.query("UPDATE deliveries SET delivered_at = NOW() - INTERVAL '8 days' WHERE order_id = $1", [orderId]);
    const late = await rate(orderId, { rating: 5 });
    expect(late.status).toBe(400);
    expect(late.body.error).toBe("The courier can be rated within 7 days of the delivery.");
    expect((await restaurant.get(`/api/orders/${orderId}`)).body.order.can_rate_courier).toBe(false);
    await pool.query("UPDATE deliveries SET delivered_at = NOW() - INTERVAL '6 days' WHERE order_id = $1", [orderId]);
    expect((await restaurant.get(`/api/orders/${orderId}`)).body.order.can_rate_courier).toBe(true);
    expect((await rate(orderId, { rating: 5 })).status).toBe(201);
  });

  it("keeps the rating when the provider fails and the retry job sends it later", async () => {
    const { orderId, deliveryId } = await deliveryOrder();
    mock().failNextRatings(2);
    const response = await rate(orderId, { rating: 2, comment: "Kasnio." });
    expect(response.status).toBe(201);
    expect(response.body.rating.sent_at).toBeNull();
    expect(await stored(orderId)).toMatchObject({ attempts: 1, last_error: "The delivery service is not available." });
    expect(mock().ratingsFor(deliveryId)).toEqual([]);

    // A new rating is left to its own request for a minute.
    expect(await retryCourierRatings()).toBe(0);
    await pool.query("UPDATE courier_ratings SET created_at = NOW() - INTERVAL '2 minutes' WHERE order_id = $1", [orderId]);
    expect(await retryCourierRatings()).toBe(0);
    expect((await stored(orderId)).attempts).toBe(2);
    expect(await retryCourierRatings()).toBe(1);
    expect(await stored(orderId)).toMatchObject({ attempts: 3, last_error: null, sent_at: expect.any(Date) });
    expect(mock().ratingsFor(deliveryId)).toEqual([{ rating: 2, comment: "Kasnio.", received_at: expect.any(String) }]);
    // Sent once only.
    expect(await retryCourierRatings()).toBe(0);
    expect(mock().ratingsFor(deliveryId)).toHaveLength(1);
  });

  it("stops retrying after the last attempt", async () => {
    const { orderId } = await deliveryOrder();
    mock().failNextRatings(1);
    await rate(orderId, { rating: 3 });
    await pool.query("UPDATE courier_ratings SET created_at = NOW() - INTERVAL '2 minutes', attempts = $2 WHERE order_id = $1", [
      orderId,
      MAX_RATING_ATTEMPTS,
    ]);
    expect(await retryCourierRatings()).toBe(0);
    expect((await stored(orderId)).sent_at).toBeNull();
  });
});
