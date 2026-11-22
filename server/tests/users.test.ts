import fs from "fs";
import path from "path";
import request from "supertest";
import app from "../src/app.js";
import { UPLOADS_DIR } from "../src/services/storage.js";
import pool from "../src/config/db.js";
import {
  cityId,
  cleanupUsers,
  createProduct,
  futureDate,
  registerAndLogin,
  orderOne,
  userId,
  type Agent,
  insertOrderItem,
  acceptItem,
} from "./helpers.js";

const STORE = "users-store@test.com";
// Weekly hours with the same value every day.
const everyDay = (hours: unknown): Record<string, unknown> =>
  Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, hours]));
const STORE_2 = "users-store-2@test.com";
const RESTAURANT = "users-restaurant@test.com";

const PROFILE = {
  first_name: "Amir",
  last_name: "Hodžić",
  business_name: "Test Market Users",
  // Olovo (set in beforeAll): a city no other test uses, so the city filter sees only these stores.
  city_id: 0,
  phone: "061000000",
  address: "Ferhadija 1",
  description: "Opis",
};

describe("Users routes", () => {
  let zenica: number;

  beforeAll(async () => {
    PROFILE.city_id = await cityId("Olovo");
    zenica = await cityId("Zenica");
  });

  afterEach(async () => {
    await cleanupUsers([STORE, STORE_2, RESTAURANT]);
  });

  describe("GET /api/users/me", () => {
    it("returns the profile without the password hash", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store.get("/api/users/me");
      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({ email: STORE, role: "STORE" });
      expect(response.body.user.password_hash).toBeUndefined();
    });

    it("returns 401 without a token", async () => {
      expect((await request(app).get("/api/users/me")).status).toBe(401);
    });
  });

  describe("PUT /api/users/me", () => {
    it("updates the profile", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store.put("/api/users/me").send(PROFILE);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Profile updated successfully.");
      expect(response.body.user).toMatchObject({ ...PROFILE, city: "Olovo" });

      const me = await store.get("/api/users/me");
      expect(me.body.user).toMatchObject({ city_id: PROFILE.city_id, city: "Olovo" });
    });

    it("accepts the city id as a numeric string", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store.put("/api/users/me").send({ ...PROFILE, city_id: String(zenica) });
      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({ city_id: zenica, city: "Zenica" });
    });

    it("keeps optional fields that are left out", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      await store.put("/api/users/me").send(PROFILE);
      const { description, ...required } = PROFILE;

      const response = await store.put("/api/users/me").send({ ...required, city_id: zenica });
      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({ city: "Zenica", description });
    });

    it.each(["first_name", "last_name", "business_name", "city_id", "address", "phone"])(
      "returns 400 without %s",
      async (field) => {
        const store = await registerAndLogin(STORE, "STORE");
        const response = await store.put("/api/users/me").send({ ...PROFILE, [field]: "" });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("First name, last name, business name, city, address and phone are required.");
      },
    );

    it("returns 400 when city_id is left out", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const { city_id: _cityId, ...withoutCity } = PROFILE;
      const response = await store.put("/api/users/me").send(withoutCity);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("First name, last name, business name, city, address and phone are required.");
    });

    it.each([999999, "abc", -1, 1.5])("returns 400 for an unknown or invalid city_id (%s)", async (value) => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store.put("/api/users/me").send({ ...PROFILE, city_id: value });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid city.");
    });
  });

  describe("GET /api/users/stores", () => {
    let restaurant: Agent;
    let store: Agent;

    beforeEach(async () => {
      store = await registerAndLogin(STORE, "STORE");
      await store.put("/api/users/me").send(PROFILE);
      restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    });

    it("counts only active, unexpired products per store", async () => {
      await createProduct(store);
      await createProduct(store);
      const sold = await createProduct(store);
      await pool.query("UPDATE products SET status = 'Sold' WHERE id = $1", [sold.id]);
      await pool.query(
        `INSERT INTO products (store_id, name, category, original_price, discounted_price, quantity, unit, expiry_date)
         VALUES ($1, 'Old', 'Meat', 2, 1, 1, 'kg', CURRENT_DATE - 1)`,
        [await userId(STORE)],
      );

      const response = await restaurant.get("/api/users/stores").query({ business_name: PROFILE.business_name });
      expect(response.status).toBe(200);
      expect(response.body.stores).toHaveLength(1);
      expect(response.body.stores[0].active_products).toBe("2");
    });

    it("counts only products with a free quantity, like the store's offers on the marketplace", async () => {
      await createProduct(store);
      // A pending order and a sale in the shop take all of it: still Available, but not on offer.
      const taken = await createProduct(store, { quantity: 10 });
      await orderOne(restaurant, taken.id, 6);
      expect((await store.post(`/api/products/${taken.id}/shop-sales`).send({ quantity: 4 })).status).toBe(201);
      expect((await pool.query("SELECT status FROM products WHERE id = $1", [taken.id])).rows[0].status).toBe("Available");

      const response = await restaurant.get("/api/users/stores").query({ business_name: PROFILE.business_name });
      expect(response.body.stores[0].active_products).toBe("1");
      const offers = await restaurant.get(`/api/products?store_id=${await userId(STORE)}`);
      expect(offers.body.products).toHaveLength(1);
    });

    it("filters by city_id and lists only stores", async () => {
      await restaurant.put("/api/users/me").send({ ...PROFILE, business_name: "Restoran" });
      const other = await registerAndLogin(STORE_2, "STORE");
      await other.put("/api/users/me").send({ ...PROFILE, business_name: "Zenica Market Users", city_id: zenica });

      const response = await restaurant.get("/api/users/stores").query({ city_id: PROFILE.city_id });
      expect(response.status).toBe(200);
      expect(response.body.stores).toHaveLength(1);
      expect(response.body.stores[0]).toMatchObject({
        business_name: PROFILE.business_name,
        city_id: PROFILE.city_id,
        city: "Olovo",
      });
    });

    it("ignores an empty city_id", async () => {
      const response = await restaurant.get("/api/users/stores").query({ city_id: "", business_name: PROFILE.business_name });
      expect(response.status).toBe(200);
      expect(response.body.stores).toHaveLength(1);
    });

    it.each(["999999", "abc"])("returns 400 for an unknown or invalid city_id (%s)", async (value) => {
      const response = await restaurant.get("/api/users/stores").query({ city_id: value });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid filter.");
    });

    it("lists only the caller's favorite stores with favorites=true", async () => {
      const other = await registerAndLogin(STORE_2, "STORE");
      await other.put("/api/users/me").send({ ...PROFILE, business_name: "Other Market Users" });
      const favoriteId = await userId(STORE);
      await restaurant.post("/api/favorites").send({ store_id: favoriteId });

      const all = await restaurant.get("/api/users/stores").query({ city_id: PROFILE.city_id });
      expect(all.body.stores).toHaveLength(2);

      const response = await restaurant.get("/api/users/stores").query({ city_id: PROFILE.city_id, favorites: "true" });
      expect(response.status).toBe(200);
      expect(response.body.stores.map((s: { id: number }) => s.id)).toEqual([favoriteId]);
    });

    it("returns 400 for an unknown favorites value", async () => {
      const response = await restaurant.get("/api/users/stores").query({ favorites: "yes" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid filter.");
    });

    it("returns each store's biggest discount over its offers, 0 without offers", async () => {
      await createProduct(store, { original_price: 10, discounted_price: 6 });
      await createProduct(store, { original_price: 10, discounted_price: 4.4 });
      // Fully ordered: not on offer, so its 90% does not count.
      const soldOut = await createProduct(store, { original_price: 10, discounted_price: 1, quantity: 1 });
      await orderOne(restaurant, soldOut.id, 1);
      const other = await registerAndLogin(STORE_2, "STORE");
      await other.put("/api/users/me").send({ ...PROFILE, business_name: "Empty Market Users" });

      const response = await restaurant.get("/api/users/stores").query({ city_id: PROFILE.city_id, sort: "name" });
      expect(response.body.stores.map((s: { business_name: string; max_discount: number }) => [s.business_name, s.max_discount])).toEqual([
        ["Empty Market Users", 0],
        [PROFILE.business_name, 56],
      ]);
    });

    it("orders by the distance between the map pins, and by city when a pin is missing", async () => {
      const olovo = (await pool.query("SELECT latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id = $1", [PROFILE.city_id]))
        .rows[0] as { lat: number; lng: number };
      // The restaurant at the centre, the first store about 4.4 km north, the second about 1.1 km north.
      await restaurant.put("/api/users/me").send({ ...PROFILE, business_name: "Restoran", location: { latitude: olovo.lat, longitude: olovo.lng } });
      await store.put("/api/users/me").send({ ...PROFILE, location: { latitude: olovo.lat + 0.04, longitude: olovo.lng } });
      const near = await registerAndLogin(STORE_2, "STORE");
      await near.put("/api/users/me").send({ ...PROFILE, business_name: "Near Market Users", location: { latitude: olovo.lat + 0.01, longitude: olovo.lng } });

      const response = await restaurant.get("/api/users/stores").query({ radius: "all", business_name: "Market Users" });
      expect(response.body.stores.map((s: { business_name: string; distance_km: number }) => [s.business_name, s.distance_km])).toEqual([
        ["Near Market Users", 1.1],
        [PROFILE.business_name, 4.4],
      ]);

      // Without the store's pin: the distance between the two cities (0 in the same city).
      await near.put("/api/users/me").send({ ...PROFILE, business_name: "Near Market Users", location: null });
      const fallback = await restaurant.get("/api/users/stores").query({ radius: "all", business_name: "Near Market Users" });
      expect(fallback.body.stores[0].distance_km).toBe(0);
    });

    it("returns 403 for a STORE", async () => {
      const response = await store.get("/api/users/stores");
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/users/stores/:id", () => {
    it("returns the store and the stats; its products are paged through /products?store_id=", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      await store.put("/api/users/me").send(PROFILE);
      const product = await createProduct(store, { quantity: 4 });
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const itemId = await orderOne(restaurant, product.id, 2);
      await acceptItem(store, itemId);

      const response = await restaurant.get(`/api/users/stores/${await userId(STORE)}`);
      expect(response.status).toBe(200);
      expect(response.body.store).toMatchObject({
        business_name: PROFILE.business_name,
        city_id: PROFILE.city_id,
        city: "Olovo",
        opening_schedule: null,
        open_now: null,
      });
      expect(response.body.products).toBeUndefined();
      expect(response.body.myOrders).toBeUndefined();

      const products = await restaurant.get("/api/products").query({ store_id: await userId(STORE) });
      expect(products.body.total).toBe(1);
      expect(products.body.products[0].id).toBe(product.id);
      expect(parseFloat(products.body.products[0].available_quantity)).toBe(2);
    });

    it("counts the offers on sale, those expiring today and the biggest discount", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      await createProduct(store, { original_price: 10, discounted_price: 6, expiry_date: futureDate(0) });
      await createProduct(store, { original_price: 10, discounted_price: 3, expiry_date: futureDate(2) });
      const soldOut = await createProduct(store, { original_price: 10, discounted_price: 1, quantity: 1 });
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      await orderOne(restaurant, soldOut.id, 1);

      const response = await restaurant.get(`/api/users/stores/${await userId(STORE)}`);
      // The fully ordered product is not on offer, so its 90% does not count.
      expect(response.body.stats).toEqual({ active_offers: 2, expiring_today: 1, max_discount: 70 });
    });

    it("returns the contact email, the order settings and the distance from the restaurant", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      await store.put("/api/users/me").send(PROFILE);
      await store.patch("/api/users/me/order-settings").send({ delivery_enabled: true, preparation_minutes: 45 });
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      await restaurant.put("/api/users/me").send({ ...PROFILE, business_name: "Restoran", city_id: zenica });

      const response = await restaurant.get(`/api/users/stores/${await userId(STORE)}`);
      expect(response.body.store).toMatchObject({
        email: STORE,
        delivery_enabled: true,
        preparation_minutes: 45,
        orders_paused: false,
        orders_paused_until: null,
      });
      // No pins: the distance between Zenica and Olovo.
      expect(response.body.store.distance_km).toBeGreaterThan(0);
      expect(Number.isInteger(response.body.store.distance_km)).toBe(true);
    });

    it("has zero stats without offers", async () => {
      await registerAndLogin(STORE, "STORE");
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const response = await restaurant.get(`/api/users/stores/${await userId(STORE)}`);
      expect(response.body.stats).toEqual({ active_offers: 0, expiring_today: 0, max_discount: 0 });
    });

    it("says whether the store is open now by its weekly hours", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      await store.put("/api/users/me").send({ ...PROFILE, opening_schedule: everyDay({ open: "00:00", close: "24:00" }) });
      const open = await restaurant.get(`/api/users/stores/${await userId(STORE)}`);
      expect(open.body.store.open_now).toBe(true);
      expect(open.body.store.opening_schedule.mon).toEqual({ open: "00:00", close: "24:00" });

      await store.put("/api/users/me").send({ ...PROFILE, opening_schedule: everyDay(null) });
      const closed = await restaurant.get(`/api/users/stores/${await userId(STORE)}`);
      expect(closed.body.store.open_now).toBe(false);
    });

    it("returns 403 for a STORE", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store.get(`/api/users/stores/${await userId(STORE)}`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You do not have permission for this action.");
    });

    it("returns 404 for an id that is not a store", async () => {
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const response = await restaurant.get(`/api/users/stores/${await userId(RESTAURANT)}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Store not found.");
    });
  });

  describe("weekly hours on PUT /api/users/me", () => {
    const HOURS = { open: "08:00", close: "20:00" };

    it("saves opening and pickup hours, keeps them when not sent and clears them with null", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const saved = await store
        .put("/api/users/me")
        .send({ ...PROFILE, opening_schedule: { ...everyDay(HOURS), sun: null }, pickup_schedule: everyDay(HOURS) });
      expect(saved.status).toBe(200);
      expect(saved.body.user.opening_schedule).toMatchObject({ mon: HOURS, sun: null });
      expect(saved.body.user.pickup_schedule.sun).toEqual(HOURS);

      const kept = await store.put("/api/users/me").send(PROFILE);
      expect(kept.body.user.opening_schedule.mon).toEqual(HOURS);

      const cleared = await store.put("/api/users/me").send({ ...PROFILE, pickup_schedule: null });
      expect(cleared.body.user.pickup_schedule).toBeNull();
      expect(cleared.body.user.opening_schedule.mon).toEqual(HOURS);
      expect((await store.get("/api/users/me")).body.user.opening_schedule.mon).toEqual(HOURS);
    });

    const withoutSunday = () => {
      const { sun: _sun, ...rest } = everyDay(HOURS);
      return rest;
    };

    it.each([
      ["a missing day", withoutSunday()],
      ["an unknown day", { ...everyDay(HOURS), xyz: null }],
      ["closing before opening", everyDay({ open: "20:00", close: "08:00" })],
      ["a bad time", everyDay({ open: "8:00", close: "20:00" })],
      ["24:00 as an opening time", everyDay({ open: "24:00", close: "24:00" })],
      ["an extra field", everyDay({ ...HOURS, note: "x" })],
      ["an array", []],
    ])("refuses %s", async (_label, schedule) => {
      const store = await registerAndLogin(STORE, "STORE");
      const opening = await store.put("/api/users/me").send({ ...PROFILE, opening_schedule: schedule });
      expect(opening.status).toBe(400);
      expect(opening.body.error).toBe("Opening hours are not valid.");
      const pickup = await store.put("/api/users/me").send({ ...PROFILE, pickup_schedule: schedule });
      expect(pickup.body.error).toBe("Pickup hours are not valid.");
    });

    it("ignores pickup hours for a restaurant", async () => {
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const response = await restaurant
        .put("/api/users/me")
        .send({ ...PROFILE, opening_schedule: everyDay(HOURS), pickup_schedule: everyDay(HOURS) });
      expect(response.status).toBe(200);
      expect(response.body.user.opening_schedule.mon).toEqual(HOURS);
      expect(response.body.user.pickup_schedule).toBeNull();
    });
  });

  describe("location on PUT /api/users/me", () => {
    // A point about 1 km from Olovo's centre (PROFILE's city), read from the city list.
    let near: { latitude: number; longitude: number };

    beforeAll(async () => {
      const olovo = await pool.query(
        "SELECT cities.latitude::float8 AS latitude, cities.longitude::float8 AS longitude FROM cities WHERE cities.name = 'Olovo'",
      );
      near = { latitude: olovo.rows[0].latitude + 0.009, longitude: olovo.rows[0].longitude };
    });

    it("has no location until the pin is set", async () => {
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const me = await restaurant.get("/api/users/me");
      expect(me.body.user).toMatchObject({ latitude: null, longitude: null });
    });

    it("saves the pin rounded to 6 decimals, keeps it when not sent and clears it with null", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const precise = { latitude: near.latitude + 0.0000004, longitude: near.longitude - 0.0000004 };
      const saved = await store.put("/api/users/me").send({ ...PROFILE, location: precise });
      expect(saved.status).toBe(200);
      expect(saved.body.user.latitude).toBe(Math.round(precise.latitude * 1e6) / 1e6);
      expect(saved.body.user.longitude).toBe(Math.round(precise.longitude * 1e6) / 1e6);
      expect(typeof saved.body.user.latitude).toBe("number");

      const kept = await store.put("/api/users/me").send(PROFILE);
      expect(kept.body.user.latitude).toBe(saved.body.user.latitude);
      expect((await store.get("/api/users/me")).body.user.longitude).toBe(saved.body.user.longitude);

      const cleared = await store.put("/api/users/me").send({ ...PROFILE, location: null });
      expect(cleared.body.user).toMatchObject({ latitude: null, longitude: null });
    });

    it.each([
      ["a missing longitude", { latitude: 44.1 }],
      ["a string", { latitude: "44.1", longitude: "18.5" }],
      ["a latitude out of range", { latitude: 91, longitude: 18.5 }],
      ["a longitude out of range", { latitude: 44.1, longitude: -181 }],
      ["an array", [44.1, 18.5]],
      ["a text", "Olovo"],
    ])("refuses %s", async (_label, location) => {
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const response = await restaurant.put("/api/users/me").send({ ...PROFILE, location });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Location is not valid.");
    });

    it("refuses a pin more than 30 km from the chosen city and changes nothing", async () => {
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      await restaurant.put("/api/users/me").send({ ...PROFILE, location: near });
      // Zenica's centre is far more than 30 km from Olovo.
      const zenicaCentre = await pool.query(
        "SELECT cities.latitude::float8 AS latitude, cities.longitude::float8 AS longitude FROM cities WHERE cities.id = $1",
        [zenica],
      );
      const far = await restaurant
        .put("/api/users/me")
        .send({ ...PROFILE, address: "Nova 1", location: zenicaCentre.rows[0] });
      expect(far.status).toBe(400);
      expect(far.body.error).toBe("The location on the map is too far from the chosen city.");
      const me = (await restaurant.get("/api/users/me")).body.user;
      expect(me.address).toBe(PROFILE.address);
      expect(me.latitude).toBe(near.latitude);

      // The same pin is accepted with the city it belongs to.
      const moved = await restaurant
        .put("/api/users/me")
        .send({ ...PROFILE, city_id: zenica, location: zenicaCentre.rows[0] });
      expect(moved.status).toBe(200);
    });
  });

  describe("POST /api/users/me/logo", () => {
    const PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const uploaded: string[] = [];

    afterEach(() => {
      for (const url of uploaded.splice(0)) {
        fs.rmSync(path.join(UPLOADS_DIR, "logos", path.basename(url)), { force: true });
      }
    });

    it("stores the image and saves its URL on the user", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store
        .post("/api/users/me/logo")
        .attach("logo", PNG, { filename: "logo.png", contentType: "image/png" });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Image uploaded successfully.");
      expect(response.body.logo_url).toMatch(/^\/uploads\/logos\/\d+-\d+-[0-9a-f]+\.png$/);
      uploaded.push(response.body.logo_url);

      expect(fs.existsSync(path.join(UPLOADS_DIR, "logos", path.basename(response.body.logo_url)))).toBe(true);
      const profile = await store.get("/api/users/me");
      expect(profile.body.user.logo_url).toBe(response.body.logo_url);
    });

    it("returns 400 when no file is sent", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store.post("/api/users/me/logo");
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("No image was uploaded.");
    });

    it("returns 400 for a file type that is not allowed", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store
        .post("/api/users/me/logo")
        .attach("logo", Buffer.from("hello"), { filename: "logo.txt", contentType: "text/plain" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Only JPEG, PNG and WEBP images are allowed.");
    });

    it("returns 400 for a file over 5MB", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const big = Buffer.alloc(5 * 1024 * 1024 + 1);
      const response = await store
        .post("/api/users/me/logo")
        .attach("logo", big, { filename: "big.png", contentType: "image/png" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("The image can be at most 5MB.");
    });
  });
});
