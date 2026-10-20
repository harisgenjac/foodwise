import fs from "fs";
import path from "path";
import request from "supertest";
import app from "../src/app.js";
import { type Agent, cleanupUsers, registerAndLogin } from "./helpers.js";

const EMAILS = ["store-a@test.com"];
// A minimal PNG signature is enough: the server checks the declared type, not the pixels.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const logoPath = (logoUrl: string) => path.join("uploads", "logos", path.basename(logoUrl));

let store: Agent;
let uploaded: string[] = [];

describe("Logo upload hardening", () => {
  beforeEach(async () => {
    store = await registerAndLogin("store-a@test.com", "STORE");
    uploaded = [];
  });

  afterEach(async () => {
    for (const logoUrl of uploaded) {
      fs.rmSync(logoPath(logoUrl), { force: true });
    }
    await cleanupUsers(EMAILS);
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
});
