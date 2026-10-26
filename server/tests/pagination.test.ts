import pool from "../src/config/db.js";
import {
  cleanupUsers,
  createDonation,
  createProduct,
  registerAndLogin,
  userId,
  type Agent,
} from "./helpers.js";

const STORE = "paging-store@test.com";
const STORE_2 = "paging-store-2@test.com";
const RESTAURANT = "paging-restaurant@test.com";
const ADMIN = "paging-admin@test.com";
const EXTRA_STORES = Array.from({ length: 4 }, (_, i) => `paging-store-x${i}@test.com`);

// Every row gets the same timestamp, so only the id keeps the order stable between pages.
const SAME_TIME = "2030-01-01 12:00:00+00";

let store: Agent;
let restaurant: Agent;

type Row = { id: number };

// Walks a list page by page (size `limit`) and checks each page against the total.
const readAllPages = async (agent: Agent, url: string, key: string, query: Record<string, string | number>, limit: number) => {
  const ids: number[] = [];
  let total = Infinity;
  for (let offset = 0; offset < total; offset += limit) {
    const response = await agent.get(url).query({ ...query, limit, offset });
    expect(response.status).toBe(200);
    total = response.body.total;
    expect(response.body[key].length).toBe(Math.min(limit, total - offset));
    ids.push(...response.body[key].map((row: Row) => row.id));
  }
  return { ids, total };
};

// The pages joined equal the whole list in one request: nothing twice, nothing skipped.
const expectStablePages = async (agent: Agent, url: string, key: string, query: Record<string, string | number> = {}) => {
  const whole = await agent.get(url).query({ ...query, limit: 100 });
  expect(whole.status).toBe(200);
  const { ids, total } = await readAllPages(agent, url, key, query, 2);
  expect(total).toBe(whole.body.total);
  expect(ids).toEqual(whole.body[key].map((row: Row) => row.id));
  expect(new Set(ids).size).toBe(ids.length);
  return ids;
};

const insertReservation = async (productId: number, status: string, days = 1) => {
  await pool.query(
    `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date, picked_up_at, created_at)
     VALUES ($1, $2, 1, 5, $3::reservation_status, (CURRENT_DATE + $4::int) + TIME '10:00',
             CASE WHEN $3::reservation_status = 'Completed' THEN $5::timestamptz END, $5)`,
    [productId, await userId(RESTAURANT), status, days, SAME_TIME],
  );
};

describe("Pagination", () => {
  beforeEach(async () => {
    store = await registerAndLogin(STORE, "STORE");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE, STORE_2, RESTAURANT, ADMIN, ...EXTRA_STORES]);
  });

  describe("products", () => {
    beforeEach(async () => {
      for (let i = 0; i < 14; i += 1) {
        await createProduct(store, { name: `Stranica ${i}`, category: i % 2 ? "Meat" : "Dairy", quantity: 100 });
      }
      await pool.query("UPDATE products SET created_at = $1 WHERE store_id = $2", [SAME_TIME, await userId(STORE)]);
    });

    it("GET /products returns 12 by default with the total of all matches", async () => {
      const response = await restaurant.get("/api/products").query({ name: "Stranica" });
      expect(response.body.products).toHaveLength(12);
      expect(response.body.total).toBe(14);
    });

    it("GET /products keeps a stable order across pages, also with filters and sort", async () => {
      await expectStablePages(restaurant, "/api/products", "products", { name: "Stranica" });
      for (const sort of ["expiry", "price_asc", "price_desc", "discount_desc", "discount_asc"]) {
        await expectStablePages(restaurant, "/api/products", "products", { name: "Stranica", sort });
      }
      const meat = await expectStablePages(restaurant, "/api/products", "products", { name: "Stranica", category: "Meat" });
      expect(meat).toHaveLength(7);
    });

    it("GET /products?store_id= lists only that store's offers", async () => {
      const other = await registerAndLogin(STORE_2, "STORE");
      await createProduct(other, { name: "Stranica druga" });

      const response = await restaurant.get("/api/products").query({ store_id: await userId(STORE_2) });
      expect(response.body.total).toBe(1);
      expect(response.body.products[0].name).toBe("Stranica druga");

      const invalid = await restaurant.get("/api/products").query({ store_id: "abc" });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toBe("Invalid filter.");
    });

    it("GET /products/mine pages the store's products with a stable order", async () => {
      const first = await store.get("/api/products/mine");
      expect(first.body.products).toHaveLength(12);
      expect(first.body.total).toBe(14);

      for (const sort of ["newest", "expiry", "price_asc", "price_desc"]) {
        await expectStablePages(store, "/api/products/mine", "products", { sort });
      }
      const filtered = await store.get("/api/products/mine").query({ category: "Dairy", limit: 3, offset: 6 });
      expect(filtered.body.total).toBe(7);
      expect(filtered.body.products).toHaveLength(1);
    });
  });

  describe("reservations", () => {
    beforeEach(async () => {
      const product = await createProduct(store, { quantity: 1000 });
      for (const status of ["Pending", "Pending", "Confirmed", "Completed", "Rejected", "Cancelled"]) {
        await insertReservation(product.id, status);
        await insertReservation(product.id, status);
      }
      // Two more Completed and one Confirmed pickup today, 15 rows in all.
      await insertReservation(product.id, "Completed");
      await insertReservation(product.id, "Completed");
      await insertReservation(product.id, "Confirmed", 0);
    });

    it("GET /reservations/mine and /store return 12 by default with the total", async () => {
      for (const [agent, url] of [[restaurant, "/api/reservations/mine"], [store, "/api/reservations/store"]] as const) {
        const response = await agent.get(url);
        expect(response.body.reservations).toHaveLength(12);
        expect(response.body.total).toBe(15);
        await expectStablePages(agent, url, "reservations");
      }
    });

    it("counts the total with the filters", async () => {
      const response = await restaurant.get("/api/reservations/mine").query({ status: "Completed", limit: 2 });
      expect(response.body.total).toBe(4);
      expect(response.body.reservations).toHaveLength(2);
      await expectStablePages(store, "/api/reservations/store", "reservations", { status: "Pending" });
    });

    it("pages only the picked-up pickups; today and upcoming are always complete", async () => {
      const completed = await store.get("/api/reservations/pickups").query({ scope: "completed", limit: 3 });
      expect(completed.body.total).toBe(4);
      expect(completed.body.reservations).toHaveLength(3);
      await expectStablePages(restaurant, "/api/reservations/pickups", "reservations", { scope: "completed" });

      const upcoming = await store.get("/api/reservations/pickups").query({ scope: "upcoming", limit: 1 });
      expect(upcoming.status).toBe(200);
      expect(upcoming.body.reservations).toHaveLength(2);
      expect(upcoming.body.total).toBeUndefined();

      const today = await store.get("/api/reservations/pickups").query({ scope: "today", limit: 1, offset: 5 });
      expect(today.body.reservations).toHaveLength(1);
    });
  });

  it("GET /users/stores pages stores with the same name in a stable order", async () => {
    for (const email of EXTRA_STORES) {
      await registerAndLogin(email, "STORE");
    }
    await pool.query("UPDATE users SET business_name = 'Paging Market', city = 'Pagingrad' WHERE email = ANY($1)", [
      EXTRA_STORES,
    ]);

    const response = await restaurant.get("/api/users/stores").query({ city: "Pagingrad", limit: 3 });
    expect(response.body.total).toBe(4);
    expect(response.body.stores).toHaveLength(3);
    await expectStablePages(restaurant, "/api/users/stores", "stores", { city: "Pagingrad" });
  });

  it("GET /donations/mine pages the donor's donations", async () => {
    for (let i = 0; i < 13; i += 1) {
      await createDonation(store, { name: `Donacija ${i}` });
    }
    await pool.query("UPDATE donation_offers SET created_at = $1 WHERE donor_id = $2", [SAME_TIME, await userId(STORE)]);

    const response = await store.get("/api/donations/mine");
    expect(response.body.donations).toHaveLength(12);
    expect(response.body.total).toBe(13);
    await expectStablePages(store, "/api/donations/mine", "donations");
  });

  it("GET /credits/requests returns the 10 newest by default with the total", async () => {
    const planId = (await pool.query("SELECT id FROM plans WHERE name = 'Standard'")).rows[0].id;
    for (let month = 1; month <= 12; month += 1) {
      await pool.query(
        `INSERT INTO credit_requests (user_id, request_type, plan_id, period_month, status, created_at)
         VALUES ($1, 'SUBSCRIPTION', $2, $3, 'REJECTED', $4)`,
        [await userId(RESTAURANT), planId, `2029-${String(month).padStart(2, "0")}-01`, SAME_TIME],
      );
    }

    const response = await restaurant.get("/api/credits/requests");
    expect(response.body.requests).toHaveLength(10);
    expect(response.body.total).toBe(12);
    await expectStablePages(restaurant, "/api/credits/requests", "requests");
  });

  it("admin lists return 20 by default", async () => {
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    for (let i = 0; i < 21; i += 1) {
      await createProduct(store, { name: `Admin stranica ${i}` });
    }

    const response = await admin.get("/api/admin/products").query({ q: "Admin stranica" });
    expect(response.body.products).toHaveLength(20);
    expect(response.body.total).toBe(21);
  });

  it.each([
    "/api/products",
    "/api/products/mine",
    "/api/reservations/mine",
    "/api/reservations/store",
    "/api/reservations/pickups?scope=completed",
    "/api/users/stores",
    "/api/donations/mine",
    "/api/credits/requests",
  ])("%s rejects an invalid limit or offset", async (url) => {
    const agent = url.startsWith("/api/products/mine") || url.startsWith("/api/reservations/store") || url.startsWith("/api/donations")
      ? store
      : restaurant;
    for (const page of ["limit=0", "limit=101", "limit=abc", "offset=-1", "offset=1.5"]) {
      const response = await agent.get(`${url}${url.includes("?") ? "&" : "?"}${page}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid filter.");
    }
  });
});
