import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";

describe("Auth rute", () => {
  afterEach(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [
      "test@example.com",
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("POST /api/auth/register", () => {
    it("Successfully registers a new user", async () => {
      const response = await request(app).post("/api/auth/register").send({
        first_name: "Test",
        last_name: "Korisnik",
        email: "test@example.com",
        password: "test12345",
        role: "STORE",
      });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Registracija uspješna.");
    });

    it("Registration with an existing email address", async () => {
      const response = await request(app).post("/api/auth/register").send({
        first_name: "Test",
        last_name: "Korisnik",
        email: "test@example.com",
        password: "test12345",
        role: "STORE",
      });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Registracija uspješna.");

      const duplicatedEmailResponse = await request(app)
        .post("/api/auth/register")
        .send({
          first_name: "Test",
          last_name: "Korisnik",
          email: "test@example.com",
          password: "test12345",
          role: "STORE",
        });
      expect(duplicatedEmailResponse.status).toBe(400);
      expect(duplicatedEmailResponse.body.error).toBe(
        "Korisnik s tim emailom već postoji.",
      );
    });

    it("Registration with a missing required field", async () => {
      const missingFieldResponse = await request(app)
        .post("/api/auth/register")
        .send({
          last_name: "Korisnik",
          email: "test@example.com",
          password: "test12345",
          role: "STORE",
        });
      expect(missingFieldResponse.status).toBe(400);
      expect(missingFieldResponse.body.error).toBe("Sva polja su obavezna.");
    });

    it("Registration with an invalid role", async () => {
      const wrongRoleResponse = await request(app)
        .post("/api/auth/register")
        .send({
          first_name: "Test",
          last_name: "Korisnik",
          email: "test@example.com",
          password: "test12345",
          role: "WRONG_ROLE",
        });
      expect(wrongRoleResponse.status).toBe(400);
      expect(wrongRoleResponse.body.error).toBe(
        "Rola mora biti STORE ili RESTAURANT.",
      );
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      const response = await request(app).post("/api/auth/register").send({
        first_name: "Test",
        last_name: "Korisnik",
        email: "test@example.com",
        password: "test12345",
        role: "STORE",
      });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Registracija uspješna.");
    });
    it("Successful login", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
        password: "test12345",
      });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Prijava uspješna.");
    });

    it("Login with incorrect password", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
        password: "wrong_pass",
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Pogrešan email ili lozinka.");
    });

    it("Login with incorrect email", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "wrong@email.com",
        password: "test12345",
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Pogrešan email ili lozinka.");
    });

    it("Login with missing field", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Email i lozinka su obavezni.");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("Successful logout", async () => {
      const response = await request(app).post("/api/auth/logout");
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Uspješno ste se odjavili.");
    });
  });
});
