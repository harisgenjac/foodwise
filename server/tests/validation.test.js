import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { PICKUP_DATE, futureDate, productBody, registerAndLogin } from "./helpers.js";

const EMAILS = ["store-a@test.com", "restaurant-a@test.com", "ana.case@test.com"];

let store;
let restaurant;

describe("Input validation and error handling", () => {
  beforeEach(async () => {
    store = await registerAndLogin(request, app, "store-a@test.com", "STORE");
    restaurant = await registerAndLogin(request, app, "restaurant-a@test.com", "RESTAURANT");
  });

  afterEach(async () => {
    await pool.query(
      "DELETE FROM reservations WHERE restaurant_id IN (SELECT id FROM users WHERE email = ANY($1))",
      [EMAILS],
    );
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [EMAILS]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("product fields", () => {
    it.each([
      ["an unknown category", { category: "Candy" }, "Kategorija nije ispravna."],
      ["an unknown unit", { unit: "tona" }, "Jedinica mjere nije ispravna."],
      ["a non-numeric price", { original_price: "deset" }, "Cijene moraju biti brojevi veći od nule."],
      ["a negative price", { discounted_price: -1 }, "Cijene moraju biti brojevi veći od nule."],
      [
        "a discounted price above the original",
        { discounted_price: 12 },
        "Snižena cijena ne može biti veća od originalne.",
      ],
      ["a negative quantity", { quantity: -3 }, "Količina mora biti broj veći od nule."],
      ["an invalid date", { expiry_date: "2026-02-31" }, "Rok trajanja nije ispravan datum."],
      ["a past expiry date", { expiry_date: futureDate(-1) }, "Rok trajanja ne može biti u prošlosti."],
    ])("rejects %s", async (_, overrides, message) => {
      const response = await store.post("/api/products").send(productBody(overrides));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(message);
    });

    it("rejects a template with an unknown category", async () => {
      const response = await store
        .post("/api/product-templates")
        .send({ name: "Predložak", category: "Candy", unit: "kg" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Kategorija nije ispravna.");
    });
  });

  describe("ids and filters", () => {
    it.each([
      ["/api/products/abc"],
      ["/api/reservations/abc"],
      ["/api/users/stores/abc"],
    ])("returns 404 for a non-numeric id in %s", async (url) => {
      const response = await restaurant.get(url);
      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
    });

    it.each([
      ["/api/products?maxPrice=abc"],
      ["/api/products?expiryWithinDays=-1"],
      ["/api/products?limit=0"],
      ["/api/products?limit=1000"],
      ["/api/reservations/mine?status=Unknown"],
    ])("returns 400 for %s", async (url) => {
      const response = await restaurant.get(url);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Neispravan filter.");
    });

    it("returns 400 for an unknown status filter on the store's products", async () => {
      const response = await store.get("/api/products/mine?status=Unknown");
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/products pagination", () => {
    it("pages the results, reports the total and leaves out fully reserved products", async () => {
      const ids = [];
      for (let i = 0; i < 4; i += 1) {
        const response = await store.post("/api/products").send(productBody({ name: `Paginacija ${i}` }));
        ids.push(response.body.product.id);
      }
      await restaurant
        .post("/api/reservations")
        .send({ product_id: ids[0], quantity: 10, pickup_date: PICKUP_DATE });

      const firstPage = await restaurant.get("/api/products?name=Paginacija&limit=2");
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.total).toBe(3);
      expect(firstPage.body.products).toHaveLength(2);

      const secondPage = await restaurant.get("/api/products?name=Paginacija&limit=2&offset=2");
      expect(secondPage.body.products).toHaveLength(1);

      const listed = [...firstPage.body.products, ...secondPage.body.products].map((p) => p.id);
      expect(listed).not.toContain(ids[0]);
    });
  });

  describe("favorites", () => {
    it("returns 404 when the favorite is not a store", async () => {
      const restaurantId = (
        await pool.query("SELECT id FROM users WHERE email = $1", ["restaurant-a@test.com"])
      ).rows[0].id;
      const response = await restaurant.post("/api/favorites").send({ store_id: restaurantId });
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Prodavnica nije pronađena.");
    });

    it("returns 404 for a missing store id", async () => {
      const response = await restaurant.post("/api/favorites").send({});
      expect(response.status).toBe(404);
    });
  });

  describe("auth", () => {
    it("treats emails case-insensitively", async () => {
      const register = await request(app).post("/api/auth/register").send({
        first_name: "Ana",
        last_name: "Case",
        email: " Ana.Case@Test.com ",
        password: "test12345",
        role: "RESTAURANT",
      });
      expect(register.status).toBe(201);

      const duplicate = await request(app).post("/api/auth/register").send({
        first_name: "Ana",
        last_name: "Case",
        email: "ANA.CASE@test.com",
        password: "test12345",
        role: "RESTAURANT",
      });
      expect(duplicate.status).toBe(400);
      expect(duplicate.body.error).toBe("Korisnik s tim emailom već postoji.");

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "ana.case@TEST.com", password: "test12345" });
      expect(login.status).toBe(200);
      expect(login.body.user.email).toBe("ana.case@test.com");
    });

    it("rejects a short password and an invalid email", async () => {
      const base = { first_name: "Ana", last_name: "Case", role: "RESTAURANT" };
      const shortPassword = await request(app)
        .post("/api/auth/register")
        .send({ ...base, email: "ana.case@test.com", password: "kratka" });
      expect(shortPassword.status).toBe(400);
      expect(shortPassword.body.error).toBe("Lozinka mora imati najmanje 8 znakova.");

      const badEmail = await request(app)
        .post("/api/auth/register")
        .send({ ...base, email: "ana.case", password: "test12345" });
      expect(badEmail.status).toBe(400);
      expect(badEmail.body.error).toBe("Email nije ispravan.");
    });
  });

  describe("global error handling", () => {
    it("answers an unknown route with a JSON error", async () => {
      const response = await request(app).get("/api/does-not-exist");
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Ruta nije pronađena.");
    });

    it("answers malformed JSON with a JSON error", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send('{"email": ');
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Neispravan format zahtjeva.");
    });
  });
});
