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
    await cleanupUsers([STORE, RESTAURANT]);
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
      expect(response.body.message).toBe("Profil uspješno ažuriran.");
      expect(response.body.user).toMatchObject(PROFILE);
    });

    it("keeps optional fields that are left out", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      await store.put("/api/users/me").send(PROFILE);
      const { address, description, ...required } = PROFILE;

      const response = await store.put("/api/users/me").send({ ...required, city: "Mostar" });
      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({ city: "Mostar", address, description });
    });

    it.each(["first_name", "last_name", "business_name", "city", "phone"])(
      "returns 400 without %s",
      async (field) => {
        const store = await registerAndLogin(STORE, "STORE");
        const response = await store.put("/api/users/me").send({ ...PROFILE, [field]: "" });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Ime, prezime, naziv biznisa, grad i telefon su obavezni.");
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

    it("returns 403 for a STORE", async () => {
      const response = await store.get("/api/users/stores");
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/users/stores/:id", () => {
    it("returns the store, its active products and the stats", async () => {
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
      expect(response.body.products).toHaveLength(1);
      expect(parseFloat(response.body.products[0].available_quantity)).toBe(2);
      expect(response.body.stats.successful_reservations).toBe("1");
      expect(response.body.myReservations.my_reservations_count).toBe("1");
    });

    it("returns 403 for a STORE", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store.get(`/api/users/stores/${await userId(STORE)}`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Nemate permisiju za ovu akciju.");
    });

    it("returns 404 for an id that is not a store", async () => {
      const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
      const response = await restaurant.get(`/api/users/stores/${await userId(RESTAURANT)}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Prodavnica nije pronađena.");
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
      expect(response.body.message).toBe("Slika uspješno postavljena.");
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
      expect(response.body.error).toBe("Slika nije poslana.");
    });

    it("returns 400 for a file type that is not allowed", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const response = await store
        .post("/api/users/me/logo")
        .attach("logo", Buffer.from("hello"), { filename: "logo.txt", contentType: "text/plain" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Dozvoljene su samo JPEG, PNG i WEBP slike.");
    });

    it("returns 400 for a file over 5MB", async () => {
      const store = await registerAndLogin(STORE, "STORE");
      const big = Buffer.alloc(5 * 1024 * 1024 + 1);
      const response = await store
        .post("/api/users/me/logo")
        .attach("logo", big, { filename: "big.png", contentType: "image/png" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Slika može imati najviše 5MB.");
    });
  });
});
