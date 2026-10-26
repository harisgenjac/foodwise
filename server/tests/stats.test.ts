import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { cleanupUsers, createProduct, registerAndLogin, userId, type Agent } from "./helpers.js";

const STORE = "stats-store@test.com";
const RESTAURANT = "stats-restaurant@test.com";
const ADMIN = "stats-admin@test.com";

// Reservations are inserted directly so every status can be set.
const insertReservation = async (productId: number, status: string, quantity: number) => {
  await pool.query(
    `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date)
     VALUES ($1, $2, $3, 5, $4::reservation_status, CURRENT_DATE + 1)`,
    [productId, await userId(RESTAURANT), quantity, status],
  );
};

// The counter is platform-wide, so tests compare against the value before their own data.
const impactKg = async (agent: Agent): Promise<number> => {
  const response = await agent.get("/api/stats/impact");
  expect(response.status).toBe(200);
  return response.body.kg;
};

describe("GET /api/stats/impact", () => {
  let store: Agent;
  let restaurant: Agent;
  let admin: Agent;

  beforeEach(async () => {
    store = await registerAndLogin(STORE, "STORE");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    admin = await registerAndLogin(ADMIN, "ADMIN");
  });

  afterEach(async () => {
    await cleanupUsers([STORE, RESTAURANT, ADMIN]);
  });

  it("requires a login", async () => {
    const response = await request(app).get("/api/stats/impact");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "You are not logged in." });
  });

  it("is open to every role", async () => {
    for (const agent of [store, restaurant, admin]) {
      const response = await agent.get("/api/stats/impact");
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Impact stats fetched successfully.");
      expect(typeof response.body.kg).toBe("number");
    }
  });

  it("counts kg and g over Confirmed and Completed reservations, like the admin statistics", async () => {
    const before = await impactKg(store);

    const kg = await createProduct(store, { unit: "kg", quantity: 100 });
    const g = await createProduct(store, { unit: "g", quantity: 5000 });
    const l = await createProduct(store, { unit: "l", quantity: 100 });
    const kom = await createProduct(store, { unit: "kom", quantity: 100 });
    await insertReservation(kg.id, "Completed", 2);
    await insertReservation(kg.id, "Confirmed", 0.5);
    await insertReservation(g.id, "Completed", 1500);
    await insertReservation(kg.id, "Pending", 10);
    await insertReservation(kg.id, "Cancelled", 10);
    await insertReservation(kg.id, "Rejected", 10);
    await insertReservation(l.id, "Completed", 7);
    await insertReservation(kom.id, "Completed", 7);

    const after = await impactKg(restaurant);
    expect(after - before).toBeCloseTo(4, 5);

    const adminStats = await admin.get("/api/admin/stats");
    expect(adminStats.body.stats.saved.kg).toBe(after);
  });
});
