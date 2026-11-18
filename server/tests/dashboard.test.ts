import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { cleanupUsers, createProduct, registerAndLogin, userId, type Agent, insertOrderItem } from "./helpers.js";

const STORE_A = "dashboard-store-a@test.com";
const STORE_B = "dashboard-store-b@test.com";
const RESTAURANT_A = "dashboard-restaurant-a@test.com";
const RESTAURANT_B = "dashboard-restaurant-b@test.com";
const ADMIN = "dashboard-admin@test.com";

// Order items are inserted directly so every status can be set; unit_price is the agreed price.
const insertItem = async (
  productId: number,
  restaurantEmail: string,
  status: string,
  quantity: number,
  unitPrice = 5,
) => {
  await insertOrderItem({ productId, restaurantId: await userId(restaurantEmail), quantity, unitPrice, status });
};

const stats = async (agent: Agent) => {
  const response = await agent.get("/api/dashboard/stats");
  expect(response.status).toBe(200);
  return response.body.stats;
};

describe("GET /api/dashboard/stats", () => {
  let storeA: Agent;
  let storeB: Agent;
  let restaurantA: Agent;

  beforeEach(async () => {
    storeA = await registerAndLogin(STORE_A, "STORE");
    storeB = await registerAndLogin(STORE_B, "STORE");
    restaurantA = await registerAndLogin(RESTAURANT_A, "RESTAURANT");
    await registerAndLogin(RESTAURANT_B, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT_A, RESTAURANT_B, ADMIN]);
  });

  it("returns zeros for a store without data", async () => {
    expect(await stats(storeA)).toEqual({
      active_products: 0,
      pending_orders: 0,
      successful_orders: 0,
      saved: { kg: 0, l: 0, pieces: 0 },
    });
  });

  it("counts the store's own active products, order items and picked-up food saved by unit", async () => {
    const kg = await createProduct(storeA, { unit: "kg", quantity: 100 });
    const g = await createProduct(storeA, { unit: "g", quantity: 5000 });
    const l = await createProduct(storeA, { unit: "l", quantity: 100 });
    const ml = await createProduct(storeA, { unit: "ml", quantity: 5000 });
    const kom = await createProduct(storeA, { unit: "kom", quantity: 100 });
    const pak = await createProduct(storeA, { unit: "pak", quantity: 100 });
    const sold = await createProduct(storeA);
    await pool.query("UPDATE products SET status = 'Sold' WHERE id = $1", [sold.id]);
    const removed = await createProduct(storeA);
    await pool.query("UPDATE products SET status = 'Removed' WHERE id = $1", [removed.id]);
    // Past its expiry date but not yet marked Expired by the nightly job: not active.
    const stale = await createProduct(storeA);
    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [stale.id]);

    await insertItem(kg.id, RESTAURANT_A, "Confirmed", 2.5);
    await insertItem(kg.id, RESTAURANT_B, "Completed", 1);
    await insertItem(g.id, RESTAURANT_A, "Completed", 500);
    await insertItem(l.id, RESTAURANT_A, "Confirmed", 3);
    await insertItem(ml.id, RESTAURANT_A, "Completed", 250);
    await insertItem(kom.id, RESTAURANT_A, "Completed", 4);
    await insertItem(pak.id, RESTAURANT_A, "Confirmed", 2);
    // Not saved: confirmed (not picked up yet), pending, rejected and cancelled quantities.
    await insertItem(kg.id, RESTAURANT_A, "Pending", 10);
    await insertItem(kg.id, RESTAURANT_B, "Pending", 10);
    await insertItem(kg.id, RESTAURANT_A, "Rejected", 10);
    await insertItem(kg.id, RESTAURANT_A, "Cancelled", 10);

    // Another store's data is never counted.
    const other = await createProduct(storeB);
    await insertItem(other.id, RESTAURANT_A, "Completed", 7);
    await insertItem(other.id, RESTAURANT_A, "Pending", 1);

    expect(await stats(storeA)).toEqual({
      active_products: 6,
      pending_orders: 2,
      successful_orders: 7,
      saved: { kg: 1.5, l: 0.25, pieces: 4 },
    });
  });

  it("returns 403 for a restaurant and an admin and 401 without a session", async () => {
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    for (const agent of [restaurantA, admin]) {
      const forbidden = await agent.get("/api/dashboard/stats");
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error).toBe("You do not have the required role for this action.");
    }

    const anonymous = await request(app).get("/api/dashboard/stats");
    expect(anonymous.status).toBe(401);
  });
});
