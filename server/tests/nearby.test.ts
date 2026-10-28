import pool from "../src/config/db.js";
import {
  cityId,
  cleanupUsers,
  createProduct,
  registerAndLogin,
  userId,
  type Agent,
} from "./helpers.js";

const RESTAURANT = "nearby-restaurant@test.com";
const NO_CITY_RESTAURANT = "nearby-restaurant-nocity@test.com";
// Stores by distance from the restaurant in Visoko (straight line between city centres).
const STORES = [
  { email: "nearby-store-visoko@test.com", city: "Visoko", km: 0 },
  { email: "nearby-store-breza@test.com", city: "Breza", km: 7 },
  { email: "nearby-store-kakanj@test.com", city: "Kakanj", km: 16 },
  { email: "nearby-store-sarajevo@test.com", city: "Sarajevo", km: 24 },
  { email: "nearby-store-zenica@test.com", city: "Zenica", km: 32 },
];
const EMAILS = [RESTAURANT, NO_CITY_RESTAURANT, ...STORES.map((store) => store.email)];
// Every product and store name of this file, so other data in the test database never matches.
const PRODUCT = "Nearby Proizvod";
const STORE_PREFIX = "Nearby Market";

const setCity = async (email: string, city: string) =>
  pool.query("UPDATE users SET city_id = $1 WHERE email = $2", [await cityId(city), email]);

type Row = { id: number; business_name: string; city: string; distance_km: number | null };

describe("Nearby offers (radius and distance)", () => {
  let restaurant: Agent;
  const storeAgents: Record<string, Agent> = {};
  const productCity: Record<number, string> = {};

  beforeEach(async () => {
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    await setCity(RESTAURANT, "Visoko");
    for (const store of STORES) {
      const agent = await registerAndLogin(store.email, "STORE");
      await pool.query("UPDATE users SET business_name = $1 WHERE email = $2", [
        `${STORE_PREFIX} ${store.city}`,
        store.email,
      ]);
      await setCity(store.email, store.city);
      storeAgents[store.city] = agent;
      const product = await createProduct(agent, { name: PRODUCT });
      productCity[product.id] = store.city;
    }
  });

  afterEach(async () => {
    await cleanupUsers(EMAILS);
  });

  const products = (query: Record<string, string | number> = {}) =>
    restaurant.get("/api/products").query({ name: PRODUCT, ...query });
  const stores = (query: Record<string, string | number> = {}) =>
    restaurant.get("/api/users/stores").query({ business_name: STORE_PREFIX, ...query });
  const productCities = (rows: Row[]) => rows.map((row) => productCity[row.id]);
  const storeCities = (rows: Row[]) => rows.map((row) => row.city);

  it("returns the distance from the restaurant's city, 0 in its own city", async () => {
    const response = await products({ radius: "all" });
    expect(response.status).toBe(200);
    expect(
      (response.body.products as Row[]).map((row) => [productCity[row.id], row.distance_km]),
    ).toEqual(STORES.map((store) => [store.city, store.km]));

    const list = await stores({ radius: "all" });
    expect((list.body.stores as Row[]).map((row) => [row.city, row.distance_km])).toEqual(
      STORES.map((store) => [store.city, store.km]),
    );
  });

  it("uses a 10 km radius by default and counts what lies beyond it", async () => {
    const response = await products();
    expect(productCities(response.body.products)).toEqual(["Visoko", "Breza"]);
    expect(response.body.total).toBe(2);
    expect(response.body.outside_radius_count).toBe(3);

    const list = await stores();
    expect(storeCities(list.body.stores)).toEqual(["Visoko", "Breza"]);
    expect(list.body.outside_radius_count).toBe(3);
  });

  it.each([
    ["5", ["Visoko"], 4],
    ["10", ["Visoko", "Breza"], 3],
    ["20", ["Visoko", "Breza", "Kakanj"], 2],
    ["50", ["Visoko", "Breza", "Kakanj", "Sarajevo", "Zenica"], 0],
    ["all", ["Visoko", "Breza", "Kakanj", "Sarajevo", "Zenica"], 0],
  ])("radius %s shows %j and counts %i further away", async (radius, cities, outside) => {
    const response = await products({ radius });
    expect(response.status).toBe(200);
    expect(productCities(response.body.products)).toEqual(cities);
    expect(response.body.outside_radius_count).toBe(outside);

    const list = await stores({ radius });
    expect(list.status).toBe(200);
    expect(storeCities(list.body.stores)).toEqual(cities);
    expect(list.body.outside_radius_count).toBe(outside);
  });

  it.each(["0", "15", "100", "abc", "-5"])("returns 400 for an invalid radius (%s)", async (radius) => {
    for (const response of [await products({ radius }), await stores({ radius })]) {
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid filter.");
    }
  });

  it("shows a chosen city whatever the radius", async () => {
    const zenica = await cityId("Zenica");
    const response = await products({ radius: "5", city_id: zenica });
    expect(productCities(response.body.products)).toEqual(["Zenica"]);
    expect(response.body.outside_radius_count).toBe(0);

    const list = await stores({ radius: "5", city_id: zenica });
    expect(storeCities(list.body.stores)).toEqual(["Zenica"]);
    expect(list.body.outside_radius_count).toBe(0);
  });

  it("shows a store's own offers (its profile) whatever the radius", async () => {
    const response = await restaurant.get("/api/products").query({ store_id: await userId(STORES[4]!.email) });
    expect(productCities(response.body.products)).toEqual(["Zenica"]);
    expect(response.body.outside_radius_count).toBe(0);
  });

  it("shows every favorite store whatever the radius, nearest first", async () => {
    for (const email of [STORES[4]!.email, STORES[0]!.email]) {
      await restaurant.post("/api/favorites").send({ store_id: await userId(email) });
    }
    const list = await stores({ favorites: "true" });
    expect(storeCities(list.body.stores)).toEqual(["Visoko", "Zenica"]);
    expect(list.body.outside_radius_count).toBe(0);
  });

  it("sorts nearest first by default, newest first within the same city", async () => {
    const newer = await createProduct(storeAgents.Breza!, { name: PRODUCT });
    productCity[newer.id] = "Breza";
    const response = await products({ radius: "all" });
    const ids = (response.body.products as Row[]).map((row) => row.id);
    expect(productCities(response.body.products)).toEqual(["Visoko", "Breza", "Breza", "Kakanj", "Sarajevo", "Zenica"]);
    expect(ids[1]).toBe(newer.id);

    // The other sorts stay.
    const newest = await products({ radius: "all", sort: "newest" });
    expect((newest.body.products as Row[])[0]!.id).toBe(newer.id);
    expect((await products({ sort: "nearest" })).status).toBe(400);
  });

  it("sorts stores by name on request, and refuses an unknown store sort", async () => {
    const list = await stores({ radius: "all", sort: "name" });
    expect(storeCities(list.body.stores)).toEqual(["Breza", "Kakanj", "Sarajevo", "Visoko", "Zenica"]);
    const invalid = await stores({ sort: "newest" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("Invalid filter.");
  });

  it("applies no radius for a restaurant without a city", async () => {
    const noCity = await registerAndLogin(NO_CITY_RESTAURANT, "RESTAURANT");
    const response = await noCity.get("/api/products").query({ name: PRODUCT });
    expect(response.body.total).toBe(5);
    expect(response.body.outside_radius_count).toBe(0);
    expect((response.body.products as Row[]).every((row) => row.distance_km === null)).toBe(true);
  });

  it("gives a store browsing the marketplace no distance and no radius", async () => {
    const response = await storeAgents.Visoko!.get("/api/products").query({ name: PRODUCT });
    expect(response.body.total).toBe(5);
    expect(response.body.outside_radius_count).toBe(0);
    expect((response.body.products as Row[]).every((row) => row.distance_km === null)).toBe(true);
  });

  it("limits the dashboard's soonest-expiring offers to 10 km", async () => {
    const response = await products({ sort: "expiry" });
    expect(productCities(response.body.products).sort()).toEqual(["Breza", "Visoko"]);
  });
});
