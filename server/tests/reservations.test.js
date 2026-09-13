import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";

let agent;

describe("Reservations routes", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send({
      first_name: "Store",
      last_name: "A",
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
      ["store-a@test.com", "restaurant-a@test.com", "restaurant-b@test.com"],
    );
    await pool.query("DELETE FROM users WHERE email IN ($1, $2, $3)", [
      "store-a@test.com",
      "restaurant-a@test.com",
      "restaurant-b@test.com",
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("POST /api/reservations", () => {
    it("reduces available_quantity after a successful reservation", async () => {
      const quantity = 10;
      const reservationQuantity = 4;
      const productResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: quantity,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(productResponse.status).toBe(201);
      const id = productResponse.body.product.id;

      await request(app).post("/api/auth/register").send({
        first_name: "Restaurant",
        last_name: "A",
        email: "restaurant-a@test.com",
        password: "test12345",
        role: "RESTAURANT",
      });

      const agentR = request.agent(app);
      await agentR.post("/api/auth/login").send({
        email: "restaurant-a@test.com",
        password: "test12345",
      });

      const reservationResponse = await agentR.post("/api/reservations").send({
        product_id: id,
        quantity: reservationQuantity,
        pickup_date: "2026-12-31T10:00:00.000Z",
      });
      expect(reservationResponse.status).toBe(201);

      const response = await agent.get(`/api/products/${id}`);
      expect(response.status).toBe(200);
      expect(parseFloat(response.body.product.available_quantity)).toBe(
        quantity - reservationQuantity,
      );
    });
    it("returns 400 when reservation quantity exceeds available quantity", async () => {
      const quantity = 10;
      const reservationQuantity = 15;
      const productResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: quantity,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(productResponse.status).toBe(201);
      const id = productResponse.body.product.id;

      await request(app).post("/api/auth/register").send({
        first_name: "Restaurant",
        last_name: "A",
        email: "restaurant-a@test.com",
        password: "test12345",
        role: "RESTAURANT",
      });

      const agentR = request.agent(app);
      await agentR.post("/api/auth/login").send({
        email: "restaurant-a@test.com",
        password: "test12345",
      });

      const reservationResponse = await agentR.post("/api/reservations").send({
        product_id: id,
        quantity: reservationQuantity,
        pickup_date: "2026-12-31T10:00:00.000Z",
      });
      expect(reservationResponse.status).toBe(400);
      expect(reservationResponse.body.error).toBe(
        "Nema dovoljno proizvoda na raspolaganju.",
      );
    });

    it("returns 404 when reserving a non-existing product", async () => {
      await request(app).post("/api/auth/register").send({
        first_name: "Restaurant",
        last_name: "A",
        email: "restaurant-a@test.com",
        password: "test12345",
        role: "RESTAURANT",
      });

      const agentR = request.agent(app);
      await agentR.post("/api/auth/login").send({
        email: "restaurant-a@test.com",
        password: "test12345",
      });

      const reservationResponse = await agentR.post("/api/reservations").send({
        product_id: 999999,
        quantity: 5,
        pickup_date: "2026-12-31T10:00:00.000Z",
      });
      expect(reservationResponse.status).toBe(404);
      expect(reservationResponse.body.error).toBe("Proizvod nije pronađen.");
    });

    it("returns 403 when a STORE user tries to create a reservation", async () => {
      const reservationResponse = await agent.post("/api/reservations").send({
        product_id: 999999,
        quantity: 5,
        pickup_date: "2026-12-31T10:00:00.000Z",
      });
      expect(reservationResponse.status).toBe(403);
      expect(reservationResponse.body.error).toBe(
        "Nemate odgovarajuću rolu za ovu akciju.",
      );
    });

    it("allows multiple restaurants to partially reserve the same product", async () => {
      const quantity = 20;
      const firstReservationQuantity = 10;
      const secondReservationQuantity = 10;
      const productResponse = await agent.post("/api/products").send({
        name: "Test Product",
        description: "Test description",
        category: "Meat",
        original_price: 10,
        discounted_price: 5,
        quantity: quantity,
        unit: "kg",
        expiry_date: "2026-12-31",
      });
      expect(productResponse.status).toBe(201);
      const id = productResponse.body.product.id;

      await request(app).post("/api/auth/register").send({
        first_name: "Restaurant",
        last_name: "A",
        email: "restaurant-a@test.com",
        password: "test12345",
        role: "RESTAURANT",
      });

      const agentA = request.agent(app);
      await agentA.post("/api/auth/login").send({
        email: "restaurant-a@test.com",
        password: "test12345",
      });

      const firstReservationResponse = await agentA
        .post("/api/reservations")
        .send({
          product_id: id,
          quantity: firstReservationQuantity,
          pickup_date: "2026-12-31T10:00:00.000Z",
        });
      expect(firstReservationResponse.status).toBe(201);

      await request(app).post("/api/auth/register").send({
        first_name: "Restaurant",
        last_name: "B",
        email: "restaurant-b@test.com",
        password: "test12345",
        role: "RESTAURANT",
      });

      const agentB = request.agent(app);
      await agentB.post("/api/auth/login").send({
        email: "restaurant-b@test.com",
        password: "test12345",
      });

      const secondReservationResponse = await agentB
        .post("/api/reservations")
        .send({
          product_id: id,
          quantity: secondReservationQuantity,
          pickup_date: "2026-12-31T10:00:00.000Z",
        });
      expect(secondReservationResponse.status).toBe(201);

      const response = await agent.get(`/api/products/${id}`);
      expect(response.status).toBe(200);
      expect(parseFloat(response.body.product.available_quantity)).toBe(
        quantity - firstReservationQuantity - secondReservationQuantity,
      );
    });

    describe("Race condition handling", () => {
      it("prevents overselling when two reservations are made simultaneously", async () => {
        const productResponse = await agent.post("/api/products").send({
          name: "Test Product",
          description: "Test description",
          category: "Meat",
          original_price: 10,
          discounted_price: 5,
          quantity: 10,
          unit: "kg",
          expiry_date: "2026-12-31",
        });
        expect(productResponse.status).toBe(201);
        const id = productResponse.body.product.id;

        await request(app).post("/api/auth/register").send({
          first_name: "Restaurant",
          last_name: "A",
          email: "restaurant-a@test.com",
          password: "test12345",
          role: "RESTAURANT",
        });

        const agentA = request.agent(app);
        await agentA.post("/api/auth/login").send({
          email: "restaurant-a@test.com",
          password: "test12345",
        });

        await request(app).post("/api/auth/register").send({
          first_name: "Restaurant",
          last_name: "B",
          email: "restaurant-b@test.com",
          password: "test12345",
          role: "RESTAURANT",
        });

        const agentB = request.agent(app);
        await agentB.post("/api/auth/login").send({
          email: "restaurant-b@test.com",
          password: "test12345",
        });

        const [responseA, responseB] = await Promise.all([
          agentA.post("/api/reservations").send({
            product_id: id,
            quantity: 8,
            pickup_date: "2026-12-31T10:00:00.000Z",
          }),
          agentB.post("/api/reservations").send({
            product_id: id,
            quantity: 8,
            pickup_date: "2026-12-31T10:00:00.000Z",
          }),
        ]);

        const statuses = [responseA.status, responseB.status].sort();
        expect(statuses).toEqual([201, 400]);
      });
    });
  });
});
