import fs from "fs";
import path from "path";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { registerAndLogin } from "./helpers.js";

const EMAILS = ["store-a@test.com"];
// A minimal PNG signature is enough: the server checks the declared type, not the pixels.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const logoPath = (logoUrl) => path.join("uploads", "logos", path.basename(logoUrl));

let store;
let uploaded = [];

describe("POST /api/users/me/logo", () => {
  beforeEach(async () => {
    store = await registerAndLogin(request, app, "store-a@test.com", "STORE");
    uploaded = [];
  });

  afterEach(async () => {
    for (const logoUrl of uploaded) {
      fs.rmSync(logoPath(logoUrl), { force: true });
    }
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [EMAILS]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("names the stored file after its image type, not the uploaded file name", async () => {
    const response = await store
      .post("/api/users/me/logo")
      .attach("logo", PNG_BYTES, { filename: "evil.html", contentType: "image/png" });
    expect(response.status).toBe(200);
    uploaded.push(response.body.logo_url);
    expect(response.body.logo_url).toMatch(/\.png$/);

    const served = await request(app).get(response.body.logo_url);
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("deletes the previous logo when a new one is uploaded", async () => {
    const first = await store
      .post("/api/users/me/logo")
      .attach("logo", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
    uploaded.push(first.body.logo_url);
    expect(fs.existsSync(logoPath(first.body.logo_url))).toBe(true);

    const second = await store
      .post("/api/users/me/logo")
      .attach("logo", PNG_BYTES, { filename: "b.png", contentType: "image/png" });
    uploaded.push(second.body.logo_url);

    expect(fs.existsSync(logoPath(first.body.logo_url))).toBe(false);
    expect(fs.existsSync(logoPath(second.body.logo_url))).toBe(true);
  });

  it("rejects a file that is not an image with a JSON error", async () => {
    const response = await store
      .post("/api/users/me/logo")
      .attach("logo", Buffer.from("<script></script>"), { filename: "x.html", contentType: "text/html" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Dozvoljene su samo JPEG, PNG i WEBP slike.");
  });
});
