import fs from "fs";
import request from "supertest";
import app from "../src/app.js";

describe("App", () => {
  it("returns 401 for a protected route without a token", async () => {
    const response = await request(app).get("/api/products");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("You are not logged in.");
  });

  it("returns a JSON 404 for an unknown API route", async () => {
    const response = await request(app).get("/api/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Route not found.");
  });

  it("returns 400 for a malformed JSON body", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{ not json");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request format.");
  });

  it("returns 400 instead of crashing when a request has no body", async () => {
    const response = await request(app).post("/api/auth/login");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("All fields are required.");
  });

  it("serves uploaded files under /uploads", async () => {
    const name = `test-static-${Date.now()}.txt`;
    fs.writeFileSync(`uploads/logos/${name}`, "logo");
    try {
      const response = await request(app).get(`/uploads/logos/${name}`);
      expect(response.status).toBe(200);
      expect(response.text).toBe("logo");
    } finally {
      fs.unlinkSync(`uploads/logos/${name}`);
    }
  });
});
