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
        cover_url: null,
        opening_schedule: null,
        open_now: null,
      });
      expect(response.body.store.email).toBeUndefined();
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

  describe("cover image", () => {
    const coverPath = (url: string) => path.join(UPLOADS_DIR, "covers", path.basename(url));
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    it("uploads, replaces (deleting the old file), shows on the store page and removes the cover", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const first = await store.post("/api/users/me/cover").attach("cover", PNG, { filename: "a.png", contentType: "image/png" });
      expect(first.status).toBe(200);
      expect(first.body.message).toBe("Image uploaded successfully.");
      expect(first.body.cover_url).toMatch(/^\/uploads\/covers\/\d+-\d+-[0-9a-f]+\.png$/);
      const second = await store.post("/api/users/me/cover").attach("cover", PNG, { filename: "b.png", contentType: "image/png" });
      expect(fs.existsSync(coverPath(first.body.cover_url))).toBe(false);
      expect(fs.existsSync(coverPath(second.body.cover_url))).toBe(true);

      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const page = await restaurant.get(`/api/users/stores/${await userId(STORE)}`);
      expect(page.body.store.cover_url).toBe(second.body.cover_url);

      const removed = await store.delete("/api/users/me/cover");
      expect(removed.body.message).toBe("Cover image removed.");
      expect(fs.existsSync(coverPath(second.body.cover_url))).toBe(false);
      expect((await store.get("/api/users/me")).body.user.cover_url).toBeNull();
    });

    it("refuses another file type and other roles", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const gif = await store
        .post("/api/users/me/cover")
        .attach("cover", Buffer.from("GIF89a"), { filename: "a.gif", contentType: "image/gif" });
      expect(gif.status).toBe(400);
      expect(gif.body.error).toBe("Only JPEG, PNG and WEBP images are allowed.");
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const response = await restaurant.post("/api/users/me/cover").attach("cover", PNG, { filename: "a.png", contentType: "image/png" });
      expect(response.status).toBe(403);
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
