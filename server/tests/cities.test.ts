import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import {
  cleanupCompanies,
  cleanupUsers,
  insertCompany,
  insertUser,
  login,
  registerAndLogin,
  type Role,
} from "./helpers.js";

const STORE = "cities-store@test.com";
const RESTAURANT = "cities-restaurant@test.com";
const ADMIN = "cities-admin@test.com";
const HQ = "cities-hq@test.com";
const COMPANY = "Cities Test Chain";

// The migration's list, in Bosnian alphabetical order (Č, Ć, Đ, Š, Ž after their base letter).
const CITIES_IN_ORDER = [
  "Banovići",
  "Breza",
  "Gračanica",
  "Hadžići",
  "Ilidža",
  "Ilijaš",
  "Kakanj",
  "Kalesija",
  "Kladanj",
  "Lukavac",
  "Maglaj",
  "Olovo",
  "Sarajevo",
  "Srebrenik",
  "Tešanj",
  "Tuzla",
  "Vareš",
  "Visoko",
  "Vogošća",
  "Zavidovići",
  "Zenica",
  "Žepče",
  "Živinice",
];

describe("GET /api/cities", () => {
  afterEach(async () => {
    await cleanupUsers([STORE, RESTAURANT, ADMIN, HQ]);
    await cleanupCompanies([COMPANY]);
  });

  it("returns 401 without a token", async () => {
    expect((await request(app).get("/api/cities")).status).toBe(401);
  });

  it.each<[string, Role]>([
    [STORE, "STORE"],
    [RESTAURANT, "RESTAURANT"],
    [ADMIN, "ADMIN"],
    [HQ, "COMPANY"],
  ])("returns every city with its id, sorted by name, to a %s", async (email, role) => {
    // A company headquarters picks its branches' cities; its login needs a company.
    const agent = role === "COMPANY"
      ? await insertUser(email, role, null, null, await insertCompany(COMPANY)).then(() => login(email))
      : await registerAndLogin(email, role);
    const response = await agent.get("/api/cities");
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Cities fetched successfully.");
    expect(response.body.cities.map((city: { name: string }) => city.name)).toEqual(CITIES_IN_ORDER);
    expect(Object.keys(response.body.cities[0]).sort()).toEqual(["id", "name"]);
    expect(typeof response.body.cities[0].id).toBe("number");
  });

  // The profile can be filled in before the temporary password is replaced, so the list must load.
  it("is available before a temporary password is changed", async () => {
    const agent = await registerAndLogin(STORE, "STORE");
    await pool.query("UPDATE users SET must_change_password = true WHERE email = $1", [STORE]);
    expect((await agent.get("/api/cities")).status).toBe(200);
  });
});
