import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { cleanupUsers, createProduct, registerAndLogin, userId, type Agent } from "./helpers.js";

const STORE_A = "dashboard-store-a@test.com";
const STORE_B = "dashboard-store-b@test.com";
const RESTAURANT_A = "dashboard-restaurant-a@test.com";
const RESTAURANT_B = "dashboard-restaurant-b@test.com";
const ADMIN = "dashboard-admin@test.com";

// Reservations are inserted directly so every status can be set; unit_price is the agreed price.
const insertReservation = async (
  productId: number,
  restaurantEmail: string,
  status: string,
  quantity: number,
  unitPrice = 5,
) => {
  await pool.query(
    `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date)
     VALUES ($1, $2, $3, $4, $5::reservation_status, CURRENT_DATE + 1)`,
    [productId, await userId(restaurantEmail), quantity, unitPrice, status],
  );
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

  it("returns zeros for a store and a restaurant without data", async () => {
    expect(await stats(storeA)).toEqual({
      active_products: 0,
      pending_reservations: 0,
      successful_reservations: 0,
      saved: { kg: 0, l: 0, pieces: 0 },
    });
    expect(await stats(restaurantA)).toEqual({
      pending_reservations: 0,
      successful_reservations: 0,
      savings: 0,
    });
  });

  it("counts the store's own active products, reservations and picked-up food saved by unit", async () => {
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

    await insertReservation(kg.id, RESTAURANT_A, "Confirmed", 2.5);
    await insertReservation(kg.id, RESTAURANT_B, "Completed", 1);
    await insertReservation(g.id, RESTAURANT_A, "Completed", 500);
    await insertReservation(l.id, RESTAURANT_A, "Confirmed", 3);
    await insertReservation(ml.id, RESTAURANT_A, "Completed", 250);
    await insertReservation(kom.id, RESTAURANT_A, "Completed", 4);
    await insertReservation(pak.id, RESTAURANT_A, "Confirmed", 2);
    // Not saved: confirmed (not picked up yet), pending, rejected and cancelled quantities.
    await insertReservation(kg.id, RESTAURANT_A, "Pending", 10);
    await insertReservation(kg.id, RESTAURANT_B, "Pending", 10);
    await insertReservation(kg.id, RESTAURANT_A, "Rejected", 10);
    await insertReservation(kg.id, RESTAURANT_A, "Cancelled", 10);

    // Another store's data is never counted.
    const other = await createProduct(storeB);
    await insertReservation(other.id, RESTAURANT_A, "Completed", 7);
    await insertReservation(other.id, RESTAURANT_A, "Pending", 1);

    expect(await stats(storeA)).toEqual({
      active_products: 6,
      pending_reservations: 2,
      successful_reservations: 7,
      saved: { kg: 1.5, l: 0.25, pieces: 4 },
    });
  });

  it("sums the restaurant's own reservations and picked-up savings at the agreed price", async () => {
    const product = await createProduct(storeA, { original_price: 10, discounted_price: 6, quantity: 100 });
    await insertReservation(product.id, RESTAURANT_A, "Confirmed", 2, 6);
    await insertReservation(product.id, RESTAURANT_A, "Completed", 1.5, 4);
    await insertReservation(product.id, RESTAURANT_A, "Pending", 3, 6);
    await insertReservation(product.id, RESTAURANT_A, "Rejected", 5, 6);
    await insertReservation(product.id, RESTAURANT_A, "Cancelled", 5, 6);
    // Another restaurant's reservations are never counted.
    await insertReservation(product.id, RESTAURANT_B, "Completed", 10, 6);
    await insertReservation(product.id, RESTAURANT_B, "Pending", 1, 6);

    // Only the Completed one saves: (10 − 4) × 1.5 = 9; the Confirmed one is not picked up yet.
    expect(await stats(restaurantA)).toEqual({
      pending_reservations: 1,
      successful_reservations: 2,
      savings: 9,
    });
  });

  it("uses the product's current full price for the savings", async () => {
    const product = await createProduct(storeA, { original_price: 10, discounted_price: 6, quantity: 100 });
    await insertReservation(product.id, RESTAURANT_A, "Completed", 2, 6);
    await pool.query("UPDATE products SET original_price = 12 WHERE id = $1", [product.id]);

    expect((await stats(restaurantA)).savings).toBe(12);
  });

  it("returns 403 for an admin and 401 without a session", async () => {
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    const forbidden = await admin.get("/api/dashboard/stats");
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toBe("You do not have the required role for this action.");

    const anonymous = await request(app).get("/api/dashboard/stats");
    expect(anonymous.status).toBe(401);
  });
});
