import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import {
  cityId,
  cleanupCompanies,
  cleanupUsers,
  createProduct,
  futureDate,
  insertCompany,
  registerAndLogin,
  userId,
  type Agent,
} from "./helpers.js";
import { WEEKDAYS } from "../src/utils/schedule.js";

const NEAR = "home-near@test.com";
const MID = "home-mid@test.com";
const FAR = "home-far@test.com";
const NO_PIN = "home-nopin@test.com";
const EMPTY = "home-empty@test.com";
const RESTAURANT = "home-restaurant@test.com";
const STORES = [NEAR, MID, FAR, NO_PIN, EMPTY];
const COMPANY = "Home Lanac d.o.o.";

// The restaurant's pin in Visoko; the stores' pins about 1, 5 and 30 km north of it.
const PIN = { latitude: 43.989, longitude: 18.178 };
const KM_LATITUDE = 1 / 111.195;

const place = async (email: string, city: string, kmNorth: number | null) =>
  pool.query("UPDATE users SET business_name = $1, city_id = $2, latitude = $3, longitude = $4 WHERE email = $5", [
    email.split("@")[0],
    await cityId(city),
    kmNorth === null ? null : PIN.latitude + kmNorth * KM_LATITUDE,
    kmNorth === null ? null : PIN.longitude,
    email,
  ]);

type HomeStore = {
  id: number;
  business_name: string;
  logo_url: string | null;
  company_name: string | null;
  city: string | null;
  distance_km: number | null;
  offer_count: number;
  is_favorite: boolean;
  products: { name: string; store_id: number; days_until_expiry: number; available_quantity: string }[];
};

describe("GET /api/products/home", () => {
  const agents: Record<string, Agent> = {};
  let restaurant: Agent;

  const home = async (): Promise<HomeStore[]> => {
    const response = await restaurant.get("/api/products/home");
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Home offers fetched successfully.");
    return response.body.stores;
  };

  beforeEach(async () => {
    for (const email of STORES) agents[email] = await registerAndLogin(email, "STORE");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    await place(RESTAURANT, "Visoko", 0);
    await place(NEAR, "Visoko", 1);
    await place(MID, "Visoko", 5);
    await place(FAR, "Visoko", 30);
    await place(NO_PIN, "Breza", null);
    await place(EMPTY, "Visoko", 0.5);
  });

  afterEach(async () => {
    await cleanupUsers([...STORES, RESTAURANT]);
    await cleanupCompanies([COMPANY]);
  });

  it("shows the nearest stores with offers by their map pins, and only the city's distance without a pin", async () => {
    for (const email of [NEAR, MID, FAR, NO_PIN]) await createProduct(agents[email]!, { name: `Ponuda ${email}` });

    const stores = await home();
    // Three stores: by pin distance, the store without a pin after them (Breza is 7 km away).
    expect(stores.map((store) => store.business_name)).toEqual(["home-near", "home-mid", "home-nopin"]);
    expect(stores[0]!.distance_km).toBeCloseTo(1, 1);
    expect(stores[1]!.distance_km).toBeCloseTo(5, 1);
    expect(stores[2]).toMatchObject({ distance_km: null, city: "Breza", is_favorite: false });
  });

  it("puts the restaurant's favourite stores first and fills up with the nearest", async () => {
    for (const email of [NEAR, MID, FAR]) await createProduct(agents[email]!, { name: `Ponuda ${email}` });
    for (const email of [FAR, EMPTY]) await restaurant.post("/api/favorites").send({ store_id: await userId(email) });

    const stores = await home();
    expect(stores.map((store) => store.business_name)).toEqual(["home-far", "home-near", "home-mid"]);
    expect(stores.map((store) => store.is_favorite)).toEqual([true, false, false]);
  });

  it("never shows a store without offers: none, expired, ordered in full, or blocked", async () => {
    await createProduct(agents[NEAR]!, { name: "Istekla" });
    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE name = 'Istekla'");
    await createProduct(agents[MID]!, { name: "Prodana", quantity: 1 });
    await pool.query("UPDATE products SET status = 'Sold' WHERE name = 'Prodana'");
    await createProduct(agents[FAR]!, { name: "Blokirana" });
    await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [FAR]);
    await restaurant.post("/api/favorites").send({ store_id: await userId(EMPTY) });

    expect(await home()).toEqual([]);
  });

  it("gives each store its offer count and its four offers that expire soonest", async () => {
    for (const days of [9, 3, 0, 7, 1, 5]) {
      await createProduct(agents[NEAR]!, { name: `Za ${days}`, expiry_date: futureDate(days), quantity: 10 });
    }

    const [store] = await home();
    expect(store!.offer_count).toBe(6);
    expect(store!.products.map((product) => product.name)).toEqual(["Za 0", "Za 1", "Za 3", "Za 5"]);
    expect(store!.products.map((product) => product.days_until_expiry)).toEqual([0, 1, 3, 5]);
    expect(Number(store!.products[0]!.available_quantity)).toBe(10);
    expect(store!.products[0]).not.toHaveProperty("shop_shortage");
    expect(store!.products[0]).not.toHaveProperty("rank_in_store");
  });

  it("names a branch's company and shows the company's logo when the branch has none", async () => {
    const companyId = await insertCompany(COMPANY);
    await pool.query("UPDATE companies SET logo_url = '/uploads/logos/lanac.png' WHERE id = $1", [companyId]);
    await pool.query("UPDATE users SET company_id = $1 WHERE email = $2", [companyId, NEAR]);
    await createProduct(agents[NEAR]!, { name: "Lanac" });
    await createProduct(agents[MID]!, { name: "Samostalna" });

    const stores = await home();
    expect(stores[0]).toMatchObject({ business_name: "home-near", company_name: COMPANY, logo_url: "/uploads/logos/lanac.png" });
    expect(stores[1]).toMatchObject({ business_name: "home-mid", company_name: null });
  });

  it("gives each store its order pause and open state from its weekly hours, without the schedule", async () => {
    for (const email of [NEAR, MID, FAR]) await createProduct(agents[email]!, { name: `Ponuda ${email}` });
    const always = Object.fromEntries(WEEKDAYS.map((day) => [day, { open: "00:00", close: "24:00" }]));
    const never = Object.fromEntries(WEEKDAYS.map((day) => [day, null]));
    await pool.query("UPDATE users SET opening_schedule = $1, orders_paused = true WHERE email = $2", [always, NEAR]);
    await pool.query("UPDATE users SET opening_schedule = $1 WHERE email = $2", [never, MID]);
    await pool.query("UPDATE users SET opening_schedule = NULL WHERE email = $1", [FAR]);

    const stores = await home();
    const byName = (email: string) => stores.find((store) => store.business_name === email.split("@")[0])!;
    expect(byName(NEAR)).toMatchObject({ orders_paused: true, orders_paused_until: null, open_now: true, closes_at: "24:00", opens_at: null });
    expect(byName(MID)).toMatchObject({ orders_paused: false, open_now: false, closes_at: null, opens_at: null, opens_on: null });
    expect(byName(FAR)).toMatchObject({ open_now: null });
    expect(byName(NEAR)).not.toHaveProperty("opening_schedule");
  });

  it("is only for restaurants", async () => {
    expect((await request(app).get("/api/products/home")).status).toBe(401);
    const response = await agents[NEAR]!.get("/api/products/home");
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("You do not have the required role for this action.");
  });
});
