import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";

const EMAILS = ["store-a@test.com", "restaurant-a@test.com"];

const registerAndLogin = async (email, role) => {
  await request(app).post("/api/auth/register").send({
    first_name: "Test",
    last_name: "User",
    email,
    password: "test12345",
    role,
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "test12345" });
  return agent;
};

describe("Users routes", () => {
  afterEach(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [EMAILS]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("GET /api/users/stores", () => {
    it("returns the number of active products per store", async () => {
      const store = await registerAndLogin("store-a@test.com", "STORE");
      const product = {
        name: "Test Product",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 10,
        unit: "kg",
        expiry_date: "2030-12-31",
      };
      await store.post("/api/products").send(product);
      await store.post("/api/products").send(product);

      const storeId = (
        await pool.query(
          "UPDATE users SET business_name = 'Test Market Active' WHERE email = $1 RETURNING id",
          ["store-a@test.com"],
        )
      ).rows[0].id;
      // An expired product does not count.
      await pool.query(
        `INSERT INTO products (store_id, name, category, original_price, discounted_price, quantity, unit, expiry_date)
         VALUES ($1, 'Old', 'Meat', 2, 1, 1, 'kg', CURRENT_DATE - 1)`,
        [storeId],
      );

      const restaurant = await registerAndLogin("restaurant-a@test.com", "RESTAURANT");
      const response = await restaurant
        .get("/api/users/stores")
        .query({ business_name: "Test Market Active" });
      expect(response.status).toBe(200);
      expect(response.body.stores).toHaveLength(1);
      expect(response.body.stores[0].active_products).toBe("2");
    });
  });
});
