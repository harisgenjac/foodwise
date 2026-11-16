import pool from "../src/config/db.js";
import { MAX_PAUSE_DAYS, parseOrderSettings } from "../src/utils/orderSettings.js";
import { type Agent, cleanupUsers, createProduct, futurePickup, registerAndLogin, userId } from "./helpers.js";

// A store's order settings (delivery phase 2): delivery on or off, the default preparation time and
// the pause on new orders, and what the pause does to the store page, Search, the cart and sending.
const STORE = "order-settings-store@test.com";
const RESTAURANT = "order-settings-restaurant@test.com";

const NOW = new Date("2026-11-16T10:00:00.000Z");

describe("parseOrderSettings", () => {
  it("accepts each setting on its own", () => {
    expect(parseOrderSettings({ delivery_enabled: false }, NOW)).toEqual({ input: { deliveryEnabled: false } });
    expect(parseOrderSettings({ preparation_minutes: 45 }, NOW)).toEqual({ input: { preparationMinutes: 45 } });
    expect(parseOrderSettings({ orders_paused: true }, NOW)).toEqual({ input: { pause: { paused: true, until: null } } });
    expect(parseOrderSettings({ orders_paused: true, orders_paused_until: "2026-11-16T12:30:00+01:00" }, NOW)).toEqual({
      input: { pause: { paused: true, until: "2026-11-16T11:30:00.000Z" } },
    });
    // Switching the pause off drops any end time.
    expect(parseOrderSettings({ orders_paused: false, orders_paused_until: "2026-11-16T12:00:00Z" }, NOW)).toEqual({
      input: { pause: { paused: false, until: null } },
    });
  });

  it("refuses wrong values", () => {
    expect(parseOrderSettings({}, NOW)).toEqual({ error: "No settings to save." });
    expect(parseOrderSettings({ delivery_enabled: "no" }, NOW)).toEqual({ error: "Delivery must be turned on or off." });
    for (const minutes of [0, 20, "30", 30.5, 240]) {
      expect(parseOrderSettings({ preparation_minutes: minutes }, NOW)).toEqual({ error: "Preparation time is not valid." });
    }
    expect(parseOrderSettings({ orders_paused: "yes" }, NOW)).toEqual({ error: "The pause must be turned on or off." });
    // An end time needs the pause itself.
    expect(parseOrderSettings({ orders_paused_until: "2026-11-16T12:00:00Z" }, NOW)).toEqual({
      error: "The pause must be turned on or off.",
    });
    const endError = { error: `The pause must end between now and ${MAX_PAUSE_DAYS} days from now.` };
    for (const until of [
      "2026-11-16T09:59:00Z", // passed
      "2026-11-16T10:00:00Z", // now
      "2026-12-17T10:00:00Z", // more than 30 days ahead
      "2026-11-16T12:00:00", // no zone
      "tomorrow",
      42,
    ]) {
      expect(parseOrderSettings({ orders_paused: true, orders_paused_until: until }, NOW)).toEqual(endError);
    }
  });
});

describe("store order settings", () => {
  let store: Agent;
  let restaurant: Agent;

  beforeEach(async () => {
    store = await registerAndLogin(STORE, "STORE");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE, RESTAURANT]);
  });

  const settings = async () => {
    const user = (await store.get("/api/users/me")).body.user;
    return {
      delivery_enabled: user.delivery_enabled,
      preparation_minutes: user.preparation_minutes,
      orders_paused: user.orders_paused,
      orders_paused_until: user.orders_paused_until,
    };
  };

  it("starts with delivery on, 30 minutes and no pause", async () => {
    expect(await settings()).toEqual({
      delivery_enabled: true,
      preparation_minutes: 30,
      orders_paused: false,
      orders_paused_until: null,
    });
  });

  it("saves each setting at once and keeps the others", async () => {
    const delivery = await store.patch("/api/users/me/order-settings").send({ delivery_enabled: false });
    expect(delivery.status).toBe(200);
    expect(delivery.body.message).toBe("Order settings saved.");
    expect(delivery.body.settings).toEqual({
      delivery_enabled: false,
      preparation_minutes: 30,
      orders_paused: false,
      orders_paused_until: null,
    });

    const preparation = await store.patch("/api/users/me/order-settings").send({ preparation_minutes: 90 });
    expect(preparation.body.settings).toMatchObject({ delivery_enabled: false, preparation_minutes: 90 });

    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const paused = await store.patch("/api/users/me/order-settings").send({ orders_paused: true, orders_paused_until: until });
    expect(paused.body.message).toBe("Orders paused.");
    expect(paused.body.settings).toMatchObject({ orders_paused: true, orders_paused_until: until });
    expect(await settings()).toEqual({
      delivery_enabled: false,
      preparation_minutes: 90,
      orders_paused: true,
      orders_paused_until: until,
    });

    const resumed = await store.patch("/api/users/me/order-settings").send({ orders_paused: false });
    expect(resumed.body.message).toBe("Orders resumed.");
    expect(resumed.body.settings).toMatchObject({ orders_paused: false, orders_paused_until: null });
  });

  it("refuses invalid settings and other roles", async () => {
    const invalid = await store.patch("/api/users/me/order-settings").send({ preparation_minutes: 20 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("Preparation time is not valid.");
    expect((await restaurant.patch("/api/users/me/order-settings").send({ orders_paused: true })).status).toBe(403);
  });

  it("counts a pause whose time has passed as off", async () => {
    await pool.query(
      "UPDATE users SET orders_paused = true, orders_paused_until = NOW() - interval '1 minute' WHERE id = $1",
      [await userId(STORE)],
    );
    expect(await settings()).toMatchObject({ orders_paused: false, orders_paused_until: null });
  });

  it("shows the pause to restaurants and refuses orders while it lasts", async () => {
    const product = await createProduct(store, { quantity: 10, discounted_price: 4 });
    await restaurant.put(`/api/cart/items/${product.id}`).send({ quantity: 2 });
    await store.patch("/api/users/me/order-settings").send({ orders_paused: true });
    const storeId = await userId(STORE);

    const page = await restaurant.get(`/api/users/stores/${storeId}`);
    expect(page.body.store).toMatchObject({ orders_paused: true, orders_paused_until: null });
    const search = await restaurant.get("/api/products/by-store");
    expect(search.body.stores.find((row: { id: number }) => row.id === storeId)).toMatchObject({ orders_paused: true });
    const list = await restaurant.get("/api/users/stores").query({ business_name: "Test Business" });
    expect(list.body.stores.find((row: { id: number }) => row.id === storeId)).toMatchObject({ orders_paused: true });

    // The products stay on offer and in the cart, but nothing can be sent.
    const added = await restaurant.put(`/api/cart/items/${product.id}`).send({ quantity: 3 });
    expect(added.status).toBe(200);
    expect(added.body.cart.store).toMatchObject({ id: storeId, orders_paused: true });
    const order = {
      pickup_at: futurePickup(),
      accept_partial: true,
      items: [{ product_id: product.id, quantity: 3, unit_price: 4 }],
    };
    const refused = await restaurant.post("/api/orders").send(order);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: "This store is not receiving orders right now.", code: "STORE_PAUSED" });
    expect((await restaurant.get("/api/cart")).body.cart.items).toHaveLength(1);

    await store.patch("/api/users/me/order-settings").send({ orders_paused: false });
    expect((await restaurant.post("/api/orders").send(order)).status).toBe(201);
  });
});
