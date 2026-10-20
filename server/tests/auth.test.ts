import request from "supertest";
import app from "../src/app.js";
import { cleanupUsers, registerUser, PASSWORD } from "./helpers.js";

const EMAIL = "auth-test@example.com";

describe("Auth routes", () => {
  afterEach(async () => {
    await cleanupUsers([EMAIL]);
  });

  describe("POST /api/auth/register", () => {
    it("registers a new user", async () => {
      const response = await registerUser(EMAIL, "STORE");
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Registracija uspješna.");
    });

    it("returns 400 for an email that is already registered", async () => {
      await registerUser(EMAIL, "STORE");
      const response = await registerUser(EMAIL, "RESTAURANT");
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Korisnik s tim emailom već postoji.");
    });

    it("returns 400 when a required field is missing", async () => {
      const response = await request(app).post("/api/auth/register").send({
        last_name: "Korisnik",
        email: EMAIL,
        password: PASSWORD,
        role: "STORE",
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Sva polja su obavezna.");
    });

    it("returns 400 for an invalid role", async () => {
      const response = await request(app).post("/api/auth/register").send({
        first_name: "Test",
        last_name: "Korisnik",
        email: EMAIL,
        password: PASSWORD,
        role: "WRONG_ROLE",
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Rola mora biti STORE ili RESTAURANT.");
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      await registerUser(EMAIL, "STORE");
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
  });

  describe("POST /api/auth/logout", () => {
    it("clears the token cookie so the session ends", async () => {
      await registerUser(EMAIL, "STORE");
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
