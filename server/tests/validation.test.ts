import request from "supertest";
import app from "../src/app.js";
import {
  type Agent,
  cleanupUsers,
  futureDate,
  futurePickup,
  productPayload,
  registerAndLogin,
  userId,
} from "./helpers.js";

const EMAILS = ["store-a@test.com", "restaurant-a@test.com", "ana.case@test.com", "validation-admin@test.com"];

let store: Agent;
let restaurant: Agent;

describe("Input validation", () => {
  beforeEach(async () => {
    store = await registerAndLogin("store-a@test.com", "STORE");
    restaurant = await registerAndLogin("restaurant-a@test.com", "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers(EMAILS);
  });

  describe("product fields", () => {
    it.each([
      ["an unknown category", { category: "Candy" }, "Category is not valid."],
      ["an unknown unit", { unit: "tona" }, "Unit of measure is not valid."],
      ["a non-numeric price", { original_price: "deset" }, "Prices and quantity must be positive numbers."],
      ["an impossible date", { expiry_date: "2026-02-31" }, "Expiry date is not valid."],
      ["a past expiry date", { expiry_date: futureDate(-1) }, "Expiry date cannot be in the past."],
    ])("rejects %s", async (_, overrides, message) => {
      const response = await store.post("/api/products").send(productPayload(overrides));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(message);
    });

    it("returns the expiry date exactly as it was saved", async () => {
      const expiry = futureDate(5);
      const created = await store.post("/api/products").send(productPayload({ expiry_date: expiry }));
      expect(created.body.product.expiry_date).toBe(expiry);

      const fetched = await store.get(`/api/products/${created.body.product.id}`);
      expect(fetched.body.product.expiry_date).toBe(expiry);
    });

    it("rejects a template with an unknown category", async () => {
      const response = await store
        .post("/api/product-templates")
        .send({ name: "Predložak", category: "Candy", unit: "kg" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Category is not valid.");
    });
  });

  describe("ids and filters", () => {
    it.each([["/api/products/abc"], ["/api/reservations/abc"], ["/api/users/stores/abc"]])(
      "returns 404 for a non-numeric id in %s",
      async (url) => {
        const response = await restaurant.get(url);
        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      },
    );

    it.each([
      ["/api/products?maxPrice=abc"],
      ["/api/products?expiryWithinDays=-1"],
      ["/api/products?limit=0"],
      ["/api/products?limit=1000"],
      ["/api/products?sort=price"],
      ["/api/reservations/mine?status=Unknown"],
    ])("returns 400 for %s", async (url) => {
      const response = await restaurant.get(url);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid filter.");
    });

    it("returns 400 for an unknown status filter on the store's products", async () => {
      const response = await store.get("/api/products/mine?status=Unknown");
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/products pagination", () => {
    it("pages the results, reports the total and leaves out fully reserved products", async () => {
      const ids: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const response = await store.post("/api/products").send(productPayload({ name: `Paginacija ${i}` }));
        ids.push(response.body.product.id);
      }
      await restaurant
        .post("/api/reservations")
        .send({ product_id: ids[0], quantity: 10, pickup_date: futurePickup() });

      const firstPage = await restaurant.get("/api/products?name=Paginacija&limit=2");
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.total).toBe(3);
      expect(firstPage.body.products).toHaveLength(2);

      const secondPage = await restaurant.get("/api/products?name=Paginacija&limit=2&offset=2");
      expect(secondPage.body.products).toHaveLength(1);

      const listed = [...firstPage.body.products, ...secondPage.body.products].map((p: { id: number }) => p.id);
      expect(listed).not.toContain(ids[0]);
    });

    it("sorts by the closest expiry date when asked", async () => {
      await store.post("/api/products").send(productPayload({ name: "Sortiranje kasno", expiry_date: futureDate(20) }));
      await store.post("/api/products").send(productPayload({ name: "Sortiranje rano", expiry_date: futureDate(2) }));

      const response = await restaurant.get("/api/products?name=Sortiranje&sort=expiry");
      expect(response.body.products.map((p: { name: string }) => p.name)).toEqual([
        "Sortiranje rano",
        "Sortiranje kasno",
      ]);
    });
  });

  it("refuses a restaurant as a favorite store", async () => {
    const restaurantId = await userId("restaurant-a@test.com");
    const response = await restaurant.post("/api/favorites").send({ store_id: restaurantId });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Store not found.");
  });

  describe("auth", () => {
    it("treats emails case-insensitively", async () => {
      const admin = await registerAndLogin("validation-admin@test.com", "ADMIN");
      const account = { password: "test12345", role: "RESTAURANT" };
      const created = await admin.post("/api/admin/users").send({ ...account, email: " Ana.Case@Test.com " });
      expect(created.status).toBe(201);
      expect(created.body.user.email).toBe("ana.case@test.com");

      const duplicate = await admin.post("/api/admin/users").send({ ...account, email: "ANA.CASE@test.com" });
      expect(duplicate.status).toBe(400);
      expect(duplicate.body.error).toBe("A user with this email already exists.");

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
      expect(shortPassword.body.error).toBe("Password must be at least 8 characters long.");

      const badEmail = await request(app)
        .post("/api/auth/register")
        .send({ ...base, email: "ana.case", password: "test12345" });
      expect(badEmail.status).toBe(400);
      expect(badEmail.body.error).toBe("Email is not valid.");
    });
  });
});
