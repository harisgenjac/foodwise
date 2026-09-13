import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";

describe("authenticate middleware", () => {
  afterEach(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [
      "middleware@test.com",
    ]);
  });

  it("returns 401 when no token is provided", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
  });

  it("returns 200 and user data when token is valid", async () => {
    await request(app).post("/api/auth/register").send({
      first_name: "Test",
      last_name: "User",
      email: "middleware@test.com",
      password: "test12345",
      role: "STORE",
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({
      email: "middleware@test.com",
      password: "test12345",
    });
    const response = await agent.get("/api/auth/me");
    expect(response.status).toBe(200);
    expect(response.body.user).toBeDefined();
  });

  it("returns 401 when token is invalid", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", ["token=invalid_token_string"]);

    expect(response.status).toBe(401);
  });
});

describe("authorize middleware", () => {
  afterEach(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [
      "middleware@test.com",
    ]);
  });

  it("returns 403 when a RESTAURANT user tries to access a STORE-only route", async () => {
    const response = await request(app).post("/api/auth/register").send({
      first_name: "Test",
      last_name: "Korisnik",
      email: "middleware@test.com",
      password: "test12345",
      role: "RESTAURANT",
    });
    expect(response.status).toBe(201);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({
      email: "middleware@test.com",
      password: "test12345",
    });
    const restaurantResponse = await agent.post("/api/products");
    expect(restaurantResponse.status).toBe(403);
    expect(restaurantResponse.body.error).toBe(
      "Nemate odgovarajuću rolu za ovu akciju.",
    );
  });

  it("allows a STORE user to access a STORE-only route", async () => {
    const response = await request(app).post("/api/auth/register").send({
      first_name: "Test",
      last_name: "Korisnik",
      email: "middleware@test.com",
      password: "test12345",
      role: "STORE",
    });
    expect(response.status).toBe(201);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({
      email: "middleware@test.com",
      password: "test12345",
    });

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
    expect(storeResponse.body.product).toBeDefined();
  });

  it("allows a RESTAURANT user to access a RESTAURANT-only route", async () => {
    const response = await request(app).post("/api/auth/register").send({
      first_name: "Test",
      last_name: "Korisnik",
      email: "middleware@test.com",
      password: "test12345",
      role: "RESTAURANT",
    });
    expect(response.status).toBe(201);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({
      email: "middleware@test.com",
      password: "test12345",
    });

    const restaurantResponse = await agent.post("/api/reservations").send({
      product_id: 1,
      quantity: 1,
      pickup_date: "2026-12-31T10:00:00.000Z",
    });
    expect(restaurantResponse.status).not.toBe(403);
  });

  it("returns 403 when a STORE user tries to access a RESTAURANT-only route", async () => {
    const response = await request(app).post("/api/auth/register").send({
      first_name: "Test",
      last_name: "Korisnik",
      email: "middleware@test.com",
      password: "test12345",
      role: "STORE",
    });
    expect(response.status).toBe(201);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({
      email: "middleware@test.com",
      password: "test12345",
    });

    const storeResponse = await agent.post("/api/reservations").send({
      product_id: 1,
      quantity: 1,
      pickup_date: "2026-12-31T10:00:00.000Z",
    });

    expect(storeResponse.status).toBe(403);
    expect(storeResponse.body.error).toBe(
      "Nemate odgovarajuću rolu za ovu akciju.",
    );
  });
});

afterAll(async () => {
  await pool.end();
});