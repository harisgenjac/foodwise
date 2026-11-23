import pool from "../src/config/db.js";
import { WEEKDAYS } from "../src/utils/schedule.js";
import { cityId, cleanupUsers, createProduct, futureDate, orderOne, registerAndLogin, type Agent } from "./helpers.js";

const STORE_A = "bystore-store-a@test.com";
const STORE_B = "bystore-store-b@test.com";
const RESTAURANT = "bystore-restaurant@test.com";
// Every product name of this file starts with it, so other data in the test database never matches.
const NAME = "BySearch";

const setCity = async (email: string, city: string) =>
  pool.query("UPDATE users SET city_id = $1, business_name = $2 WHERE email = $3", [await cityId(city), `${city} ${email}`, email]);

type StoreRow = {
  id: number;
  business_name: string;
  city: string;
  logo_url: string | null;
  distance_km: number | null;
  match_count: number;
  products: { name: string; store_id: number; shop_shortage?: unknown }[];
};

describe("GET /api/products/by-store (Search)", () => {
  let storeA: Agent;
  let storeB: Agent;
  let restaurant: Agent;

  beforeEach(async () => {
    storeA = await registerAndLogin(STORE_A, "STORE");
    storeB = await registerAndLogin(STORE_B, "STORE");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    await setCity(STORE_A, "Visoko");
    await setCity(STORE_B, "Breza");
    await setCity(RESTAURANT, "Visoko");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT]);
  });

  const search = (query: Record<string, string | number> = {}) =>
    restaurant.get("/api/products/by-store").query({ name: NAME, radius: "all", ...query });

  it("groups the matches by store with all its products and the match count", async () => {
    for (let i = 1; i <= 5; i += 1) await createProduct(storeA, { name: `${NAME} A${i}`, expiry_date: futureDate(i) });
    await createProduct(storeB, { name: `${NAME} B1` });
    await pool.query("UPDATE users SET logo_url = '/uploads/logos/a.png' WHERE email = $1", [STORE_A]);

    const response = await search({ sort: "expiry" });
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    const stores: StoreRow[] = response.body.stores;
    expect(stores.map((store) => store.match_count).sort()).toEqual([1, 5]);
    const big = stores.find((store) => store.match_count === 5)!;
    expect(big).toMatchObject({ logo_url: "/uploads/logos/a.png", city: "Visoko", distance_km: 0 });
    expect(big.products.map((product) => product.name)).toEqual([1, 2, 3, 4, 5].map((i) => `${NAME} A${i}`));
    expect(big.products[0]).not.toHaveProperty("shop_shortage");
    expect(big.products[0]).not.toHaveProperty("rank_in_store");
  });

  it("orders the stores by their best match for the sort and pages by store", async () => {
    await createProduct(storeA, { name: `${NAME} A`, discounted_price: 9, original_price: 10 });
    await createProduct(storeB, { name: `${NAME} B`, discounted_price: 2, original_price: 10 });

    const cheapest = await search({ sort: "price_asc" });
    expect(cheapest.body.stores.map((store: StoreRow) => store.products[0]!.name)).toEqual([`${NAME} B`, `${NAME} A`]);
    const nearest = await search({ sort: "distance" });
    expect(nearest.body.stores.map((store: StoreRow) => store.distance_km)).toEqual([0, 7]);

    const first = await search({ sort: "price_asc", limit: 1 });
    const second = await search({ sort: "price_asc", limit: 1, offset: 1 });
    expect(first.body.total).toBe(2);
    expect(first.body.stores).toHaveLength(1);
    expect(second.body.stores[0].products[0].name).toBe(`${NAME} A`);
  });

  it("applies the marketplace filters: category, expiry, city and the radius with its hint", async () => {
    await createProduct(storeA, { name: `${NAME} Mlijeko`, category: "Dairy", expiry_date: futureDate(0) });
    await createProduct(storeA, { name: `${NAME} Hljeb`, category: "Bakery", expiry_date: futureDate(5) });
    await createProduct(storeB, { name: `${NAME} Sir`, category: "Dairy", expiry_date: futureDate(2) });

    const dairy = await search({ category: "Dairy" });
    expect(dairy.body.stores.map((store: StoreRow) => store.match_count)).toEqual([1, 1]);
    const today = await search({ expiryWithinDays: 0 });
    expect(today.body.stores).toHaveLength(1);
    expect(today.body.stores[0].products[0].name).toBe(`${NAME} Mlijeko`);
    const breza = await search({ city_id: await cityId("Breza") });
    expect(breza.body.stores.map((store: StoreRow) => store.city)).toEqual(["Breza"]);

    const near = await search({ radius: 5 });
    expect(near.body.stores).toHaveLength(1);
    expect(near.body.outside_radius_count).toBe(1);
  });

  it("returns each store's order pause and open state from its weekly hours", async () => {
    await createProduct(storeA, { name: `${NAME} A` });
    await createProduct(storeB, { name: `${NAME} B` });
    const allDay = { open: "00:00", close: "24:00" };
    const always = Object.fromEntries(WEEKDAYS.map((day) => [day, allDay]));
    const never = Object.fromEntries(WEEKDAYS.map((day) => [day, null]));
    await pool.query("UPDATE users SET opening_schedule = $1, orders_paused = true WHERE email = $2", [always, STORE_A]);
    await pool.query("UPDATE users SET opening_schedule = $1 WHERE email = $2", [never, STORE_B]);

    const response = await search();
    const byCity = (city: string) => response.body.stores.find((store: StoreRow) => store.city === city);
    expect(byCity("Visoko")).toMatchObject({ orders_paused: true, open_now: true, closes_at: "24:00", opens_at: null });
    expect(byCity("Breza")).toMatchObject({ orders_paused: false, open_now: false, closes_at: null, opens_at: null, opens_on: null });
    expect(byCity("Visoko")).not.toHaveProperty("opening_schedule");

    await pool.query("UPDATE users SET opening_schedule = NULL WHERE email = $1", [STORE_B]);
    const noHours = await search();
    expect(noHours.body.stores.find((store: StoreRow) => store.city === "Breza")).toMatchObject({ open_now: null });
  });

  it("leaves out fully ordered products and stores without matches", async () => {
    const product = await createProduct(storeA, { name: `${NAME} Jedini`, quantity: 1 });
    await orderOne(restaurant, product.id, 1);
    const response = await search();
    expect(response.body).toMatchObject({ stores: [], total: 0 });
  });

  it("refuses invalid filters and is for restaurants only", async () => {
    expect((await search({ sort: "abc" })).status).toBe(400);
    expect((await search({ limit: 0 })).status).toBe(400);
    expect((await search({ expiryWithinDays: -1 })).status).toBe(400);
    const response = await storeA.get("/api/products/by-store");
    expect(response.status).toBe(403);
  });
});
