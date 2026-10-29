import request from "supertest";
import app from "../src/app.js";
import { allowedOrigins } from "../src/middleware/origin.middleware.js";

const CLIENT = allowedOrigins[0]!;
const FOREIGN = "https://evil.example.com";

describe("origin check", () => {
  it("refuses a state-changing request from a foreign Origin", async () => {
    const response = await request(app).post("/api/auth/logout").set("Origin", FOREIGN);
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Request origin not allowed.");
  });

  it("checks PUT, PATCH and DELETE too", async () => {
    for (const method of ["put", "patch", "delete"] as const) {
      const response = await request(app)[method]("/api/users/me").set("Origin", FOREIGN);
      expect(response.status).toBe(403);
    }
  });

  it("lets a request from CLIENT_ORIGIN through", async () => {
    const response = await request(app).post("/api/auth/logout").set("Origin", CLIENT);
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Logged out successfully.");
  });

  it("lets a request without Origin and Referer through", async () => {
    const response = await request(app).post("/api/auth/logout");
    expect(response.status).toBe(200);
  });

  it("falls back to the Referer's origin when Origin is missing", async () => {
    const foreign = await request(app)
      .post("/api/auth/logout")
      .set("Referer", `${FOREIGN}/some/page`);
    expect(foreign.status).toBe(403);
    expect(foreign.body.error).toBe("Request origin not allowed.");

    const own = await request(app).post("/api/auth/logout").set("Referer", `${CLIENT}/dashboard`);
    expect(own.status).toBe(200);
  });

  it("refuses an unparseable Referer", async () => {
    const response = await request(app).post("/api/auth/logout").set("Referer", "not a url");
    expect(response.status).toBe(403);
  });

  it("does not check GET requests", async () => {
    const response = await request(app).get("/api/auth/me").set("Origin", FOREIGN);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("You are not logged in.");
  });
});
