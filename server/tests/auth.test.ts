import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { cleanupUsers, insertUser, PASSWORD } from "./helpers.js";

const EMAIL = "auth-test@example.com";

const registration = (overrides: Record<string, unknown> = {}) => ({
  first_name: "Test",
  last_name: "Korisnik",
  email: EMAIL,
  password: PASSWORD,
  role: "STORE",
  ...overrides,
});

describe("Auth routes", () => {
  afterEach(async () => {
    await cleanupUsers([EMAIL]);
  });

  describe("POST /api/auth/register", () => {
    it.each(["STORE", "RESTAURANT", "ADMIN"])("refuses to register a %s account", async (role) => {
      const response = await request(app).post("/api/auth/register").send(registration({ role }));
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Naloge za prodavnice i restorane kreira administrator.");

      const users = await pool.query("SELECT id FROM users WHERE email = $1", [EMAIL]);
      expect(users.rows).toHaveLength(0);
    });

    it("returns 400 when a required field is missing", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send(registration({ first_name: undefined }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Sva polja su obavezna.");
    });

    it("returns 400 for an unknown role", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send(registration({ role: "WRONG_ROLE" }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Rola nije ispravna.");
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      await insertUser(EMAIL, "STORE");
    });

    it("logs in, sets an httpOnly cookie and returns the user without the hash", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: EMAIL, password: PASSWORD });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Prijava uspješna.");
      expect(response.body.user).toMatchObject({ email: EMAIL, role: "STORE" });
      expect(response.body.user.password_hash).toBeUndefined();

      const cookie = String(response.headers["set-cookie"]);
      expect(cookie).toContain("token=");
      expect(cookie).toContain("HttpOnly");
    });

    it("returns 400 for a wrong password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: EMAIL, password: "wrong_pass" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Pogrešan email ili lozinka.");
    });

    it("returns 400 for an unknown email", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: PASSWORD });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Pogrešan email ili lozinka.");
    });

    it("returns 400 when a field is missing", async () => {
      const response = await request(app).post("/api/auth/login").send({ email: EMAIL });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Sva polja su obavezna.");
    });

    it("refuses a blocked account and shows the reason, without setting a cookie", async () => {
      await pool.query(
        "UPDATE users SET is_blocked = true, blocked_reason = 'Kršenje pravila' WHERE email = $1",
        [EMAIL],
      );
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: EMAIL, password: PASSWORD });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Vaš nalog je blokiran. Razlog: Kršenje pravila");
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("does not reveal a block to someone with the wrong password", async () => {
      await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [EMAIL]);
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: EMAIL, password: "wrong_pass" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Pogrešan email ili lozinka.");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears the token cookie so the session ends", async () => {
      await insertUser(EMAIL, "STORE");
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
      expect((await agent.get("/api/auth/me")).status).toBe(200);

      const response = await agent.post("/api/auth/logout");
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Uspješno ste se odjavili.");
      expect(String(response.headers["set-cookie"])).toMatch(/token=;/);

      expect((await agent.get("/api/auth/me")).status).toBe(401);
    });
  });
});
