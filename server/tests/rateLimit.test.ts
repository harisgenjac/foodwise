import request from "supertest";
import app from "../src/app.js";
import { rateLimiters } from "../src/middleware/rateLimit.middleware.js";
import { cleanupUsers, PASSWORD, registerAndLogin, userId } from "./helpers.js";

// The real limiters are off under Vitest; this file swaps in enabled ones with low limits.
vi.mock("../src/middleware/rateLimit.middleware.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/middleware/rateLimit.middleware.js")>();
  return {
    ...original,
    rateLimiters: original.createRateLimiters({ api: 30, login: 3, password: 2, upload: 2 }, true),
  };
});

const STORE = "ratelimit-store@test.com";
const RESTAURANT = "ratelimit-restaurant@test.com";
const ADMIN = "ratelimit-admin@test.com";
const TOO_MANY = "Too many requests. Please try again later.";

const loginAs = (email: string, password: string) =>
  request(app).post("/api/auth/login").send({ email, password });

afterEach(async () => {
  await rateLimiters.reset();
  await cleanupUsers([STORE, RESTAURANT, ADMIN]);
});

describe("rate limits", () => {
  it("limits /api per IP and answers 429 JSON with the standard headers", async () => {
    for (let i = 0; i < 30; i++) {
      const response = await request(app).get("/api/auth/me");
      expect(response.status).toBe(401);
      expect(response.headers["ratelimit-policy"]).toContain("q=30");
      expect(response.headers["ratelimit"]).toBeDefined();
    }
    const blocked = await request(app).get("/api/auth/me");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: TOO_MANY });
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("counts only failed logins, per IP and email", async () => {
    await registerAndLogin(STORE, "STORE");
    await registerAndLogin(RESTAURANT, "RESTAURANT");

    // Successful logins give their slot back.
    for (let i = 0; i < 5; i++) expect((await loginAs(STORE, PASSWORD)).status).toBe(200);

    for (let i = 0; i < 3; i++) expect((await loginAs(STORE, "wrong-password")).status).toBe(400);
    const blocked = await loginAs(STORE, PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe(TOO_MANY);

    // The email is part of the key (case-insensitively), so another account still logs in.
    expect((await loginAs(STORE.toUpperCase(), PASSWORD)).status).toBe(429);
    expect((await loginAs(RESTAURANT, PASSWORD)).status).toBe(200);
  });

  it("limits password changes per user", async () => {
    const store = await registerAndLogin(STORE, "STORE");
    const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    const change = { current_password: "wrong-password", new_password: "new-password-1" };

    for (let i = 0; i < 2; i++) {
      expect((await store.put("/api/users/me/password").send(change)).status).not.toBe(429);
    }
    const blocked = await store.put("/api/users/me/password").send(change);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe(TOO_MANY);

    expect((await restaurant.put("/api/users/me/password").send(change)).status).not.toBe(429);
  });

  it("limits the admin's password resets", async () => {
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    await registerAndLogin(STORE, "STORE");
    const url = `/api/admin/users/${await userId(STORE)}/password`;

    for (let i = 0; i < 2; i++) {
      expect((await admin.patch(url).send({ password: "short" })).status).toBe(400);
    }
    const blocked = await admin.patch(url).send({ password: "long-enough-1" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe(TOO_MANY);
  });

  it("shares one upload limit between logo uploads and CSV imports, per user", async () => {
    const store = await registerAndLogin(STORE, "STORE");
    const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");

    expect((await store.post("/api/users/me/logo")).body.error).toBe("No image was uploaded.");
    expect((await store.post("/api/products/import")).body.error).toBe("A CSV file is required.");
    const blocked = await store.post("/api/users/me/logo");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe(TOO_MANY);

    expect((await restaurant.post("/api/users/me/logo")).status).toBe(400);
  });
});
