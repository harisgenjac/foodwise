import fs from "fs";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import {
  cleanupUsers,
  createProduct,
  registerAndLogin,
  reserve,
  userId,
  type Agent,
} from "./helpers.js";

const STORE = "users-store@test.com";
const STORE_2 = "users-store-2@test.com";
const RESTAURANT = "users-restaurant@test.com";

const PROFILE = {
  first_name: "Amir",
  last_name: "Hodžić",
  business_name: "Test Market Users",
  city: "Testograd",
  phone: "061000000",
  address: "Ferhadija 1",
  description: "Opis",
};

describe("Users routes", () => {
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
      expect(response.body.user).toMatchObject(PROFILE);
    });

    it("keeps optional fields that are left out", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      await store.put("/api/users/me").send(PROFILE);
      const { description, ...required } = PROFILE;

      const response = await store.put("/api/users/me").send({ ...required, city: "Mostar" });
      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({ city: "Mostar", description });
    });

    it.each(["first_name", "last_name", "business_name", "city", "address", "phone"])(
      "returns 400 without %s",
      async (field) => {
        const store = await registerAndLogin(STORE, "STORE");
        const response = await store.put("/api/users/me").send({ ...PROFILE, [field]: "" });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("First name, last name, business name, city, address and phone are required.");
      },
    );
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

    it("filters by city, case-insensitively, and lists only stores", async () => {
      await restaurant.put("/api/users/me").send({ ...PROFILE, business_name: "Restoran" });

      const response = await restaurant.get("/api/users/stores").query({ city: "testo" });
      expect(response.status).toBe(200);
      expect(response.body.stores.map((s: { business_name: string }) => s.business_name)).toEqual([
        PROFILE.business_name,
      ]);
    });

    it("lists only the caller's favorite stores with favorites=true", async () => {
      const other = await registerAndLogin(STORE_2, "STORE");
      await other.put("/api/users/me").send({ ...PROFILE, business_name: "Other Market Users" });
      const favoriteId = await userId(STORE);
      await restaurant.post("/api/favorites").send({ store_id: favoriteId });

      const all = await restaurant.get("/api/users/stores").query({ city: "Testograd" });
      expect(all.body.stores).toHaveLength(2);

      const response = await restaurant.get("/api/users/stores").query({ city: "Testograd", favorites: "true" });
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
      const reservation = await reserve(restaurant, product.id, 2);
      await store.patch(`/api/reservations/${reservation}/accept`);

      const response = await restaurant.get(`/api/users/stores/${await userId(STORE)}`);
      expect(response.status).toBe(200);
      expect(response.body.store).toMatchObject({ business_name: PROFILE.business_name, city: PROFILE.city });
      expect(response.body.store.email).toBeUndefined();
      expect(response.body.products).toBeUndefined();
      // Accepted but not picked up yet: not counted.
      expect(response.body.stats.successful_reservations).toBe("0");
      expect(response.body.myReservations.my_reservations_count).toBe("0");

      const products = await restaurant.get("/api/products").query({ store_id: await userId(STORE) });
      expect(products.body.total).toBe(1);
      expect(products.body.products[0].id).toBe(product.id);
      expect(parseFloat(products.body.products[0].available_quantity)).toBe(2);
    });

    it("counts only picked-up (Completed) reservations, not Pending, Confirmed, Rejected or Cancelled", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const product = await createProduct(store, { quantity: 10 });
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      for (const status of ["Pending", "Confirmed", "Rejected", "Cancelled", "Completed"]) {
        await pool.query(
          `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date, picked_up_at)
           VALUES ($1, $2, 1, 5, $3::reservation_status, CURRENT_DATE + 1,
                   CASE WHEN $3::reservation_status = 'Completed' THEN NOW() END)`,
          [product.id, await userId(RESTAURANT), status],
        );
      }

      const response = await restaurant.get(`/api/users/stores/${await userId(STORE)}`);
      expect(response.status).toBe(200);
      expect(response.body.stats.successful_reservations).toBe("1");
      expect(response.body.myReservations.my_reservations_count).toBe("1");
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

  describe("POST /api/users/me/logo", () => {
    const PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const uploaded: string[] = [];

    afterEach(() => {
      for (const url of uploaded.splice(0)) {
        fs.rmSync(`.${url}`, { force: true });
      }
    });

    it("stores the image and saves its URL on the user", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store
        .post("/api/users/me/logo")
        .attach("logo", PNG, { filename: "logo.png", contentType: "image/png" });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Image uploaded successfully.");
      expect(response.body.logo_url).toMatch(/^\/uploads\/logos\/\d+-\d+\.png$/);
      uploaded.push(response.body.logo_url);

      expect(fs.existsSync(`.${response.body.logo_url}`)).toBe(true);
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
