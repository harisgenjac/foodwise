import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { cleanupUsers, createProduct, registerAndLogin, userId, type Agent, insertOrderItem } from "./helpers.js";

const STORE = "stats-store@test.com";
const RESTAURANT = "stats-restaurant@test.com";
const ADMIN = "stats-admin@test.com";

describe("GET /api/stats/my-impact", () => {
  const OTHER = "stats-restaurant-other@test.com";
  let store: Agent;
  let restaurant: Agent;
  let other: Agent;

  const myImpact = async (agent: Agent) => {
    const response = await agent.get("/api/stats/my-impact");
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Impact stats fetched successfully.");
    return response.body.impact;
  };

  beforeEach(async () => {
    store = await registerAndLogin(STORE, "STORE");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    other = await registerAndLogin(OTHER, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE, RESTAURANT, OTHER, ADMIN]);
  });

  it("sums the restaurant's own picked-up food (litres as kilograms, pieces left out), CO₂ and savings", async () => {
    const kg = await createProduct(store, { unit: "kg", quantity: 100, original_price: 10, discounted_price: 6 });
    const g = await createProduct(store, { unit: "g", quantity: 5000, original_price: 10, discounted_price: 6 });
    const l = await createProduct(store, { unit: "l", quantity: 100, original_price: 4, discounted_price: 2 });
    const ml = await createProduct(store, { unit: "ml", quantity: 5000, original_price: 4, discounted_price: 2 });
    const kom = await createProduct(store, { unit: "kom", quantity: 100, original_price: 3, discounted_price: 1 });
    const restaurantId = await userId(RESTAURANT);
    const item = (productId: number, status: string, quantity: number, unitPrice: number) =>
      insertOrderItem({ productId, restaurantId, quantity, unitPrice, status });
    await item(kg.id, "Completed", 2, 6); // 2 kg, saves (10 − 6) × 2 = 8
    await item(g.id, "Completed", 500, 0.004); // 0.5 kg, saves (10 − 0.004) × 500 = 4998
    await item(l.id, "Completed", 3, 2); // 3 l, saves 6
    await item(ml.id, "Completed", 250, 1); // 0.25 l, saves 3 × 250 = 750
    await item(kom.id, "Completed", 4, 1); // pieces: not food in kg, but still saves 8
    // Not picked up: never counted.
    for (const status of ["Pending", "Confirmed", "InDelivery", "Rejected", "Cancelled"]) await item(kg.id, status, 10, 6);
    // Another restaurant's pickup is not this one's.
    await insertOrderItem({ productId: kg.id, restaurantId: await userId(OTHER), quantity: 7, unitPrice: 6, status: "Completed" });

    const impact = await myImpact(restaurant);
    expect(impact.food_kg).toBeCloseTo(5.75, 5);
    expect(impact.co2_kg).toBeCloseTo(5.75 * 2.5, 5);
    expect(impact.savings).toBeCloseTo(8 + 4998 + 6 + 750 + 8, 2);
  });

  it("counts savings like the purchases report: the current full price, never negative", async () => {
    const product = await createProduct(store, { unit: "kg", quantity: 100, original_price: 10, discounted_price: 6 });
    const restaurantId = await userId(RESTAURANT);
    await insertOrderItem({ productId: product.id, restaurantId, quantity: 2, unitPrice: 6, status: "Completed" });
    await pool.query("UPDATE products SET original_price = 12 WHERE id = $1", [product.id]);
    expect((await myImpact(restaurant)).savings).toBe(12);

    await pool.query("UPDATE products SET original_price = 5 WHERE id = $1", [product.id]);
    expect((await myImpact(restaurant)).savings).toBe(0);
  });

  it("shows zeros while the restaurant has picked up nothing, whatever other restaurants saved", async () => {
    const product = await createProduct(store, { unit: "kg", quantity: 100, original_price: 10, discounted_price: 6 });
    await insertOrderItem({ productId: product.id, restaurantId: await userId(OTHER), quantity: 3, unitPrice: 6, status: "Completed" });
    // Its own order that is not picked up yet does not count as picked-up food.
    await insertOrderItem({ productId: product.id, restaurantId: await userId(RESTAURANT), quantity: 1, unitPrice: 6, status: "Confirmed" });

    expect(await myImpact(restaurant)).toEqual({ food_kg: 0, co2_kg: 0, savings: 0 });
    // The other restaurant has its own numbers.
    expect(await myImpact(other)).toEqual({ food_kg: 3, co2_kg: 7.5, savings: 12 });
  });

  it("is only for restaurants", async () => {
    const anonymous = await request(app).get("/api/stats/my-impact");
    expect(anonymous.status).toBe(401);
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    for (const agent of [store, admin]) {
      const response = await agent.get("/api/stats/my-impact");
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You do not have the required role for this action.");
    }
  });
});
