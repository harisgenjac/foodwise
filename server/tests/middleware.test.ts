import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../src/app.js";
import { cleanupUsers, createProduct, futurePickup, registerAndLogin, userId } from "./helpers.js";

const STORE = "middleware-store@test.com";
const RESTAURANT = "middleware-restaurant@test.com";

afterEach(async () => {
  await cleanupUsers([STORE, RESTAURANT]);
});

describe("authenticate middleware", () => {
  it("returns 401 when no token is provided", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("You are not logged in.");
  });

  it("returns the user from a valid token", async () => {
    const agent = await registerAndLogin(STORE, "STORE");
    const response = await agent.get("/api/auth/me");
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ role: "STORE" });
    expect(typeof response.body.user.id).toBe("number");
  });

  it("returns 401 for a malformed token", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", ["token=invalid_token_string"]);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Token is invalid or has expired.");
  });

  it("returns 401 for a token signed with another secret", async () => {
    const token = jwt.sign({ id: 1, role: "STORE" }, "not-the-real-secret");
    const response = await request(app).get("/api/auth/me").set("Cookie", [`token=${token}`]);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Token is invalid or has expired.");
  });

  it("returns 401 for a valid token of a deleted user", async () => {
    const token = jwt.sign({ id: 999999, role: "STORE" }, process.env.JWT_SECRET!);
    const response = await request(app).get("/api/auth/me").set("Cookie", [`token=${token}`]);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Token is invalid or has expired.");
  });

  it("takes the role from the database, not from the token", async () => {
    await registerAndLogin(STORE, "STORE");
    const token = jwt.sign({ id: await userId(STORE), role: "ADMIN" }, process.env.JWT_SECRET!);
    const response = await request(app).get("/api/admin/stats").set("Cookie", [`token=${token}`]);
    expect(response.status).toBe(403);
  });

  it("returns 401 for an expired token", async () => {
    const token = jwt.sign({ id: 1, role: "STORE" }, process.env.JWT_SECRET!, { expiresIn: -10 });
    const response = await request(app).get("/api/auth/me").set("Cookie", [`token=${token}`]);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Token is invalid or has expired.");
  });
});

describe("authorize middleware", () => {
  it("returns 403 when a RESTAURANT calls a STORE-only route", async () => {
    const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    const response = await restaurant.post("/api/products");
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("You do not have the required role for this action.");
  });

  it("lets a STORE call a STORE-only route", async () => {
    const store = await registerAndLogin(STORE, "STORE");
    const product = await createProduct(store);
    expect(product.id).toEqual(expect.any(Number));
  });

  it("lets a RESTAURANT call a RESTAURANT-only route", async () => {
    const store = await registerAndLogin(STORE, "STORE");
    const product = await createProduct(store);
    const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");

    const response = await restaurant
      .post("/api/reservations")
      .send({ product_id: product.id, quantity: 1, pickup_date: futurePickup() });
    expect(response.status).toBe(201);
  });

  it("returns 403 when a STORE calls a RESTAURANT-only route", async () => {
    const store = await registerAndLogin(STORE, "STORE");
    const response = await store
      .post("/api/reservations")
      .send({ product_id: 1, quantity: 1, pickup_date: futurePickup() });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("You do not have the required role for this action.");
  });
});
