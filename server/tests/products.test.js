import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";

let agent;

describe("Products routes", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send({
      first_name: "Test",
      last_name: "Korisnik",
      email: "store-a@test.com",
      password: "test12345",
      role: "STORE",
    });

    agent = request.agent(app);
    await agent.post("/api/auth/login").send({
      email: "store-a@test.com",
      password: "test12345",
    });
  });

  afterEach(async () => {
    await pool.query(
      "DELETE FROM reservations WHERE restaurant_id IN (SELECT id FROM users WHERE email IN ($1, $2, $3))",
      ["store-a@test.com", "store-b@test.com", "restaurant-a@test.com"],
    );
    await pool.query("DELETE FROM users WHERE email IN ($1, $2, $3)", [
      "store-a@test.com",
      "store-b@test.com",
      "restaurant-a@test.com",
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("POST /api/products", () => {
    it("creates a product successfully", async () => {
      const storeResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(storeResponse.status).toBe(201);
      expect(storeResponse.body.message).toBe("Proizvod uspješno dodan.");
    });

    it("returns 400 when required field is missing", async () => {
      const storeResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(storeResponse.status).toBe(400);
      expect(storeResponse.body.error).toBe("Sva polja su obavezna.");
    });
  });

  describe("PUT /api/products/:id", () => {
    it("updates a product successfully", async () => {
      const productResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(productResponse.status).toBe(201);
      const id = productResponse.body.product.id;

      const response = await agent.put(`/api/products/${id}`).send({
        name: "Test Product - Edited",
        description: "Test description - Edited",
        category: "Meat",
        original_price: 15,
        discounted_price: 10,
        quantity: 10,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Proizvod uspješno ažuriran.");
    });

    it("returns 403 when trying to update another store's product", async () => {
      const productResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(productResponse.status).toBe(201);
      const id = productResponse.body.product.id;

      await request(app).post("/api/auth/register").send({
        first_name: "Store",
        last_name: "B",
        email: "store-b@test.com",
        password: "test12345",
        role: "STORE",
      });
      const agentB = request.agent(app);
      await agentB.post("/api/auth/login").send({
        email: "store-b@test.com",
        password: "test12345",
      });
      const response = await agentB.put(`/api/products/${id}`).send({
        name: "Hacked Name",
        description: "Test description",
        category: "Meat",
        original_price: 15,
        discounted_price: 10,
        quantity: 10,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe(
        "Nemate dozvolu za izmjenu ovog proizvoda.",
      );
    });
    it("returns 404 when trying to update non existing product", async () => {
      const response = await agent.put(`/api/products/999999`).send({
        name: "Test Product - Edited",
        description: "Test description - Edited",
        category: "Meat",
        original_price: 15,
        discounted_price: 10,
        quantity: 10,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Proizvod nije pronađen.");
    });
  });

  describe("DELETE /api/products/:id", () => {
    it("deletes a product successfully and sets status to Removed", async () => {
      const productResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(productResponse.status).toBe(201);
      const id = productResponse.body.product.id;

      const response = await agent.delete(`/api/products/${id}`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Proizvod uspješno obrisan.");
      expect(response.body.product.status).toBe("Removed");
    });

    it("returns 403 when trying to delete another stores product", async () => {
      const productResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(productResponse.status).toBe(201);
      const id = productResponse.body.product.id;

      await request(app).post("/api/auth/register").send({
        first_name: "Store",
        last_name: "B",
        email: "store-b@test.com",
        password: "test12345",
        role: "STORE",
      });
      const agentB = request.agent(app);
      await agentB.post("/api/auth/login").send({
        email: "store-b@test.com",
        password: "test12345",
      });
      const response = await agentB.delete(`/api/products/${id}`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe(
        "Nemate dozvolu za brisanje ovog proizvoda.",
      );
    });

    it("returns 404 when trying to delete non existing product", async () => {
      const response = await agent.delete(`/api/products/99999`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Proizvod nije pronađen.");
    });
    it("returns 400 when product has an active reservation", async () => {
      const productResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      const id = productResponse.body.product.id;
      expect(productResponse.status).toBe(201);

      await request(app).post("/api/auth/register").send({
        first_name: "Test",
        last_name: "Korisnik",
        email: "restaurant-a@test.com",
        password: "test12345",
        role: "RESTAURANT",
      });

      const agentR = request.agent(app);
      await agentR.post("/api/auth/login").send({
        email: "restaurant-a@test.com",
        password: "test12345",
      });

      const restaurantResponse = await agentR.post("/api/reservations").send({
        product_id: id,
        quantity: 1,
        pickup_date: "2026-12-31T10:00:00.000Z",
      });
      expect(restaurantResponse.status).toBe(201);

      const deleteResponse = await agent.delete(`/api/products/${id}`);
      expect(deleteResponse.status).toBe(400);
      expect(deleteResponse.body.error).toBe(
        "Proizvod ima aktivne rezervacije i ne može biti obrisan.",
      );
    });
  });
  describe("GET /api/products", () => {
    it("returns list of available products", async () => {
      const productResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(productResponse.status).toBe(201);

      const getResponse = await agent.get("/api/products");
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.products.length).toBeGreaterThan(0);
    });

    it("filters products by category", async () => {
      const firstProductResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(firstProductResponse.status).toBe(201);

      const categoryResponse = await agent.get("/api/products?category=Meat");
      expect(categoryResponse.status).toBe(200);
      expect(
        categoryResponse.body.products.every((p) => p.category === "Meat"),
      ).toBe(true);
    });
  });
  describe("GET /api/products/mine", () => {
    it('return list of my products', async () => {
      const firstProductResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(firstProductResponse.status).toBe(201);
      const store_id = firstProductResponse.body.product.store_id;

      await request(app).post("/api/auth/register").send({
        first_name: "Test",
        last_name: "Korisnik",
        email: "store-b@test.com",
        password: "test12345",
        role: "STORE",
      });

      const agentB = request.agent(app);
      await agentB.post("/api/auth/login").send({
        email: "store-b@test.com",
        password: "test12345",
      });
      const secondProductResponse = await agentB.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(secondProductResponse.status).toBe(201);

      const response = await agent.get('/api/products/mine')
      expect(response.status).toBe(200);
      expect(response.body.products.every((p)=> p.store_id === store_id)).toBe(true)
    })
  })
  
  describe("GET /api/products/:id", () => {
  it('returns product details including available_quantity', async () => {
    const productResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: 5,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(productResponse.status).toBe(201);
      const id = productResponse.body.product.id;

      const response = await agent.get(`/api/products/${id}`)
      expect(response.status).toBe(200);
      expect(response.body.product.available_quantity).toBeDefined()
      expect(parseFloat(response.body.product.available_quantity)).toBe(parseFloat(response.body.product.quantity));
  });

  it('returns 404 for non existing product', async () => {
      const response = await agent.get('/api/products/9999')
      expect(response.status).toBe(404);
  });
});
});
