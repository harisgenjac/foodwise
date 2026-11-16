import pool from "../src/config/db.js";
import { type Agent, cityId, cleanupUsers, createProduct, futurePickup, registerAndLogin, userId } from "./helpers.js";

// The cart's delivery choice (delivery phase 2): GET /cart/delivery says whether the store can
// deliver now and what the mock quotes; POST /orders with DELIVERY quotes again and keeps the
// address and the estimate on the order.
const STORE = "cart-delivery-store@test.com";
const RESTAURANT = "cart-delivery-restaurant@test.com";

// Sarajevo centre → Ilidža: 8.76 km, 9.10 KM with the mock (tests/mockDelivery.test.ts).
const STORE_PIN = { latitude: 43.8563, longitude: 18.4131 };
const RESTAURANT_PIN = { latitude: 43.8296, longitude: 18.3103 };
// Zenica, about 60 km away: beyond the mock's 25 km.
const ZENICA_PIN = { latitude: 44.2017, longitude: 17.9078 };

const ALWAYS_CLOSED = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, null]));

let store: Agent;
let restaurant: Agent;
let storeId: number;
let restaurantId: number;

const setUser = (id: number, fields: Record<string, unknown>) => {
  const keys = Object.keys(fields);
  return pool.query(
    `UPDATE users SET ${keys.map((key, index) => `${key} = $${index + 2}`).join(", ")} WHERE id = $1`,
    [id, ...keys.map((key) => fields[key])],
  );
};

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  storeId = await userId(STORE);
  restaurantId = await userId(RESTAURANT);
  const sarajevo = await cityId("Sarajevo");
  await setUser(storeId, { city_id: sarajevo, address: "Ferhadija 1", phone: "033000000", ...STORE_PIN });
  await setUser(restaurantId, { city_id: sarajevo, address: "Butmirska cesta 2", phone: "033111111", ...RESTAURANT_PIN });
});

afterEach(async () => {
  await cleanupUsers([STORE, RESTAURANT]);
});

const fillCart = async (quantity = 2) => {
  const product = await createProduct(store, { quantity: 10, discounted_price: 5 });
  await restaurant.put(`/api/cart/items/${product.id}`).send({ quantity });
  return product;
};

const delivery = async () => (await restaurant.get("/api/cart/delivery")).body.delivery;

describe("GET /api/cart/delivery", () => {
  it("is for restaurants with something in the cart", async () => {
    expect((await store.get("/api/cart/delivery")).status).toBe(403);
    const empty = await restaurant.get("/api/cart/delivery");
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe("The cart is empty.");
  });

  it("quotes today's delivery after the store's preparation time", async () => {
    await fillCart();
    await setUser(storeId, { preparation_minutes: 45 });
    const before = Date.now();
    const response = await restaurant.get("/api/cart/delivery");
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Delivery checked.");
    const option = response.body.delivery;
    expect(option).toMatchObject({ available: true, price: "9.10" });
    // Ready in 45 minutes, the courier 5 minutes later, then 31 minutes on the way.
    const pickup = new Date(option.estimated_pickup_at).getTime();
    expect(pickup - before).toBeGreaterThanOrEqual(50 * 60 * 1000);
    expect(pickup - before).toBeLessThan(51 * 60 * 1000);
    expect(new Date(option.estimated_delivery_at).getTime() - pickup).toBe(31 * 60 * 1000);
  });

  it("says why delivery is not available", async () => {
    await fillCart();
    const cases: [Record<string, unknown>, number, string][] = [
      [{ delivery_enabled: false }, storeId, "STORE_NO_DELIVERY"],
      [{ orders_paused: true }, storeId, "STORE_PAUSED"],
      [{ opening_schedule: JSON.stringify(ALWAYS_CLOSED) }, storeId, "STORE_CLOSED"],
      [{ latitude: null, longitude: null }, storeId, "STORE_NO_LOCATION"],
      [{ latitude: null, longitude: null }, restaurantId, "RESTAURANT_NO_LOCATION"],
      [ZENICA_PIN, restaurantId, "OUT_OF_ZONE"],
    ];
    for (const [fields, id, reason] of cases) {
      const original = id === storeId ? STORE_PIN : RESTAURANT_PIN;
      await setUser(id, fields);
      expect(await delivery()).toEqual({ available: false, reason });
      await setUser(id, { delivery_enabled: true, orders_paused: false, opening_schedule: null, ...original });
    }
    expect(await delivery()).toMatchObject({ available: true });
  });
});

describe("sending a delivery order", () => {
  it("keeps the delivery address and the estimate, with no pickup time needed", async () => {
    const product = await fillCart(2);
    const response = await restaurant.post("/api/orders").send({
      fulfilment_method: "DELIVERY",
      accept_partial: true,
      items: [{ product_id: product.id, quantity: 2, unit_price: 5 }],
    });
    expect(response.status).toBe(201);
    expect(response.body.order).toMatchObject({
      fulfilment_method: "DELIVERY",
      delivery_address: "Butmirska cesta 2, Sarajevo",
      delivery_latitude: RESTAURANT_PIN.latitude,
      delivery_longitude: RESTAURANT_PIN.longitude,
      delivery_fee_estimate: "9.10",
    });
    expect((await restaurant.get("/api/cart")).body.cart.items).toHaveLength(0);

    const details = await restaurant.get(`/api/orders/${response.body.order.id}`);
    expect(details.body.order).toMatchObject({
      fulfilment_method: "DELIVERY",
      delivery_address: "Butmirska cesta 2, Sarajevo",
      delivery_fee_estimate: "9.10",
    });
    // The courier's estimated pickup, today in local time.
    const today = await pool.query<{ today: string }>("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today");
    expect(String(details.body.order.pickup_at)).toContain(today.rows[0]!.today);
    expect(details.body.order.delivery_estimated_at).toEqual(expect.any(String));
  });

  it("refuses a delivery the store cannot make, and leaves the cart alone", async () => {
    const product = await fillCart(2);
    await setUser(storeId, { delivery_enabled: false });
    const response = await restaurant.post("/api/orders").send({
      fulfilment_method: "DELIVERY",
      items: [{ product_id: product.id, quantity: 2, unit_price: 5 }],
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "Delivery is not available for this order.",
      code: "DELIVERY_UNAVAILABLE",
      reason: "STORE_NO_DELIVERY",
    });
    expect((await restaurant.get("/api/cart")).body.cart.items).toHaveLength(1);

    // Pickup still works, and still needs its time.
    const pickup = { items: [{ product_id: product.id, quantity: 2, unit_price: 5 }] };
    expect((await restaurant.post("/api/orders").send({ ...pickup, fulfilment_method: "PICKUP" })).status).toBe(400);
    expect((await restaurant.post("/api/orders").send({ ...pickup, pickup_at: futurePickup() })).status).toBe(201);
  });

  it("still refuses an unknown fulfilment method", async () => {
    const product = await fillCart(1);
    const response = await restaurant.post("/api/orders").send({
      fulfilment_method: "COURIER",
      items: [{ product_id: product.id, quantity: 1, unit_price: 5 }],
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Fulfilment method is not valid.");
  });
});

describe("accepting a delivery order", () => {
  // A delivery order of 2 × 5 KM (10 KM of goods), and its one item.
  const sendDelivery = async () => {
    const product = await fillCart(2);
    const response = await restaurant.post("/api/orders").send({
      fulfilment_method: "DELIVERY",
      accept_partial: true,
      items: [{ product_id: product.id, quantity: 2, unit_price: 5 }],
    });
    expect(response.status).toBe(201);
    return { orderId: response.body.order.id as number, itemId: response.body.order.items[0].id as number };
  };
  // A few minutes ahead, so it stays today (unless the test runs in the last minutes before midnight).
  const soon = () => new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const notificationTypes = async (id: number) =>
    (
      await pool.query<{ type: string }>("SELECT type FROM notifications WHERE user_id = $1 ORDER BY id", [id])
    ).rows.map((row) => row.type);

  it("needs a ready time today", async () => {
    const { orderId, itemId } = await sendDelivery();
    const accept = { items: [{ item_id: itemId, action: "ACCEPT" }] };
    const missing = await store.post(`/api/orders/${orderId}/decision`).send(accept);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("Choose when the order will be ready.");
    const tomorrow = await store
      .post(`/api/orders/${orderId}/decision`)
      .send({ ...accept, ready_at: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString() });
    expect(tomorrow.status).toBe(400);
    expect(tomorrow.body.error).toBe("The ready time must be later today, before the store closes.");
    expect((await store.get(`/api/orders/${orderId}`)).body.order.status).toBe("Pending");
  });

  it("creates the delivery with the final price and the cash for the accepted goods", async () => {
    const { orderId, itemId } = await sendDelivery();
    const readyAt = soon();
    const response = await store
      .post(`/api/orders/${orderId}/decision`)
      .send({ items: [{ item_id: itemId, action: "ACCEPT_LESS", quantity: 1, reason: "QUALITY" }], ready_at: readyAt });
    expect(response.status).toBe(200);

    const order = (await restaurant.get(`/api/orders/${orderId}`)).body.order;
    expect(order.status).toBe("Confirmed");
    expect(new Date(order.ready_at).toISOString()).toBe(readyAt);
    // 1 × 5 KM accepted + 9.10 KM delivery, in cash to the courier.
    expect(order.delivery).toMatchObject({ status: "CREATED", price: "9.10", cash_to_collect: "14.10", failure_reason: null });
    // The courier comes 5 minutes after the goods are ready.
    expect(new Date(order.delivery.estimated_pickup_at).getTime() - new Date(readyAt).getTime()).toBe(5 * 60 * 1000);
    expect(new Date(order.delivery_estimated_at).getTime()).toBe(new Date(order.delivery.estimated_delivery_at).getTime());
    expect(await notificationTypes(restaurantId)).toEqual(["ORDER_PARTIALLY_ACCEPTED"]);
  });

  it("rejecting needs no ready time and creates no delivery", async () => {
    const { orderId } = await sendDelivery();
    const response = await store.post(`/api/orders/${orderId}/decision`).send({ reject_order: true, reason: "QUALITY" });
    expect(response.status).toBe(200);
    const order = (await restaurant.get(`/api/orders/${orderId}`)).body.order;
    expect(order).toMatchObject({ status: "Rejected", ready_at: null, delivery: null });
  });

  it("keeps the acceptance when the delivery cannot be created, and tells both sides", async () => {
    const { orderId, itemId } = await sendDelivery();
    // The order's address moved out of the mock's zone after it was sent.
    await pool.query("UPDATE orders SET delivery_latitude = $2, delivery_longitude = $3 WHERE id = $1", [
      orderId,
      ZENICA_PIN.latitude,
      ZENICA_PIN.longitude,
    ]);
    const response = await store
      .post(`/api/orders/${orderId}/decision`)
      .send({ items: [{ item_id: itemId, action: "ACCEPT" }], ready_at: soon() });
    expect(response.status).toBe(200);
    const order = (await store.get(`/api/orders/${orderId}`)).body.order;
    expect(order.status).toBe("Confirmed");
    expect(order.delivery).toMatchObject({ status: "FAILED", price: null, failure_reason: "OUT_OF_ZONE" });
    expect(await notificationTypes(restaurantId)).toEqual(["ORDER_ACCEPTED", "DELIVERY_FAILED"]);
    expect(await notificationTypes(storeId)).toContain("DELIVERY_FAILED");
  });

  it("asks no ready time for a pickup order", async () => {
    const product = await fillCart(1);
    const sent = await restaurant.post("/api/orders").send({
      pickup_at: futurePickup(),
      items: [{ product_id: product.id, quantity: 1, unit_price: 5 }],
    });
    const response = await store
      .post(`/api/orders/${sent.body.order.id}/decision`)
      .send({ items: [{ item_id: sent.body.order.items[0].id, action: "ACCEPT" }] });
    expect(response.status).toBe(200);
    expect((await store.get(`/api/orders/${sent.body.order.id}`)).body.order).toMatchObject({ ready_at: null, delivery: null });
  });
});
