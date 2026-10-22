import request from "supertest";
import app from "../src/app.js";
import { type Agent, cleanupUsers, login, PASSWORD, registerAndLogin, userId } from "./helpers.js";

const ADMIN = "password-admin@test.com";
const STORE = "password-store@test.com";
const NEW_USER = "password-new@test.com";
const EMAILS = [ADMIN, STORE, NEW_USER];
const NEW_PASSWORD = "vlastita-lozinka";

let admin: Agent;
let store: Agent;

const change = (agent: Agent, current_password: unknown, new_password: unknown) =>
  agent.put("/api/users/me/password").send({ current_password, new_password });

describe("Password", () => {
  beforeEach(async () => {
    admin = await registerAndLogin(ADMIN, "ADMIN");
    store = await registerAndLogin(STORE, "STORE");
  });

  afterEach(async () => {
    await cleanupUsers(EMAILS);
  });

  describe("PUT /api/users/me/password", () => {
    it("changes the password: the new one logs in, the old one no longer does", async () => {
      const response = await change(store, PASSWORD, NEW_PASSWORD);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Password changed.");

      await expect(login(STORE, NEW_PASSWORD)).resolves.toBeDefined();
      const old = await request(app).post("/api/auth/login").send({ email: STORE, password: PASSWORD });
      expect(old.status).toBe(400);
    });

    it.each([
      [undefined, NEW_PASSWORD, "All fields are required."],
      [PASSWORD, "", "All fields are required."],
      ["pogresna-lozinka", NEW_PASSWORD, "Current password is incorrect."],
      [PASSWORD, "kratka", "Password must be at least 8 characters long."],
      [PASSWORD, PASSWORD, "The new password must be different from the current one."],
    ])("rejects current %s and new %s", async (current, next, message) => {
      const response = await change(store, current, next);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(message);
      await expect(login(STORE)).resolves.toBeDefined();
    });

    it("works for an admin too", async () => {
      expect((await change(admin, PASSWORD, NEW_PASSWORD)).status).toBe(200);
    });

    it("needs a session", async () => {
      expect((await request(app).put("/api/users/me/password").send({})).status).toBe(401);
    });
  });

  describe("temporary password set by an admin", () => {
    it("must be changed before anything but the profile works", async () => {
      await admin.post("/api/admin/users").send({ role: "STORE", email: NEW_USER, password: PASSWORD });
      const loginResponse = await request(app).post("/api/auth/login").send({ email: NEW_USER, password: PASSWORD });
      expect(loginResponse.body.user.must_change_password).toBe(true);
      const user = await login(NEW_USER);

      const blocked = await user.get("/api/products");
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toBe("You must change your password before continuing.");
      expect((await user.get("/api/notifications")).status).toBe(403);

      const me = await user.get("/api/users/me");
      expect(me.status).toBe(200);
      expect(me.body.user.must_change_password).toBe(true);
      const profile = await user.put("/api/users/me").send({
        first_name: "Nova",
        last_name: "Prodavnica",
        business_name: "Nova",
        city: "Sarajevo",
        address: "Titova 3",
        phone: "061000000",
      });
      expect(profile.status).toBe(200);
      // Query strings do not change the route.
      expect((await user.get("/api/users/me?fresh=1")).status).toBe(200);

      expect((await change(user, PASSWORD, NEW_PASSWORD)).status).toBe(200);
      expect((await user.get("/api/products")).status).toBe(200);
      expect((await user.get("/api/users/me")).body.user.must_change_password).toBe(false);
    });

    it("is required again after the admin sets a new password", async () => {
      const storeId = await userId(STORE);
      await admin.patch(`/api/admin/users/${storeId}/password`).send({ password: "privremena-1" });

      // The existing session is held back at once, not only after the next login.
      const blocked = await store.get("/api/products");
      expect(blocked.status).toBe(403);
      const details = await admin.get(`/api/admin/users/${storeId}`);
      expect(details.body.user.must_change_password).toBe(true);

      expect((await change(store, "privremena-1", NEW_PASSWORD)).status).toBe(200);
      expect((await store.get("/api/products")).status).toBe(200);
    });

    it("is not required for accounts that set their own password", async () => {
      const me = await store.get("/api/users/me");
      expect(me.body.user.must_change_password).toBe(false);
      expect((await store.get("/api/products")).status).toBe(200);
    });
  });
});
