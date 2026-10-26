import type { PoolClient } from "pg";
import pool from "../src/config/db.js";
import {
  adjustCredits,
  chargeForProduct,
  chargeForReservation,
  getBalance,
  refundForReservation,
} from "../src/services/creditService.js";
import { creditMonth } from "../src/utils/creditTime.js";
import {
  type Agent,
  cleanupUsers,
  createDonation,
  createProduct,
  futureDate,
  futurePickup,
  giveSubscription,
  insertUser,
  login,
  registerAndLogin,
  userId,
} from "./helpers.js";

const ADMIN = "sorting-admin@test.com";
const STORE = "sorting-store@test.com";
const RESTAURANT = "sorting-restaurant@test.com";
const USERS = ["sorting-user-a@test.com", "sorting-user-b@test.com", "sorting-user-c@test.com"];
// Credit overview accounts, A..F in creation order (so their ids grow in that order).
const CREDIT_USERS = ["a", "b", "c", "d", "e", "f"].map((key) => `sorting-credit-${key}@test.com`);
const ALL = [ADMIN, STORE, RESTAURANT, ...USERS, ...CREDIT_USERS];

const SYSTEM = { actor: "SYSTEM" as const, userId: null };

const inTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

let admin: Agent;
let nextEntityId = 1;
// Charges only need an entity id.
const freshId = () => 950000 + nextEntityId++;

const ids = (rows: { id: number }[]) => rows.map((row) => row.id);

// Every page of `url` with `limit` 2, joined.
const allPages = async (url: string, query: Record<string, string>, key: string) => {
  const rows: { id: number }[] = [];
  for (let offset = 0; ; offset += 2) {
    const response = await admin.get(url).query({ ...query, limit: 2, offset });
    expect(response.status).toBe(200);
    rows.push(...response.body[key]);
    if (offset + 2 >= response.body.total) return rows;
  }
};

beforeEach(async () => {
  await cleanupUsers(ALL);
  admin = await registerAndLogin(ADMIN, "ADMIN");
});

afterEach(async () => {
  await cleanupUsers(ALL);
});

describe("sorting the admin tables", () => {
  it("sorts users by created date in both directions and keeps the default order without sort", async () => {
    for (const email of USERS) await insertUser(email, "STORE");
    const [a, b, c] = await Promise.all(USERS.map(userId));
    await pool.query("UPDATE users SET created_at = $1 WHERE id = $2", ["2026-01-02T10:00:00Z", a]);
    await pool.query("UPDATE users SET created_at = $1 WHERE id = $2", ["2026-01-01T10:00:00Z", b]);
    await pool.query("UPDATE users SET created_at = $1 WHERE id = $2", ["2026-01-03T10:00:00Z", c]);
    const list = async (query: Record<string, string>) =>
      ids((await admin.get("/api/admin/users").query({ q: "sorting-user", ...query })).body.users);

    expect(await list({ sort: "created_at", dir: "asc" })).toEqual([b, a, c]);
    expect(await list({ sort: "created_at", dir: "desc" })).toEqual([c, a, b]);
    // `dir` defaults to ascending; no sort (or an empty one) keeps newest first.
    expect(await list({ sort: "created_at" })).toEqual([b, a, c]);
    expect(await list({})).toEqual([c, a, b]);
    expect(await list({ sort: "", dir: "" })).toEqual([c, a, b]);
  });

  it("sorts products by price and expiry date, combined with filters, with a stable tie-breaker", async () => {
    const store = await registerAndLogin(STORE, "STORE");
    const cheap = await createProduct(store, { name: "Sortprod 1", discounted_price: 2, expiry_date: futureDate(9) });
    const dear = await createProduct(store, { name: "Sortprod 2", discounted_price: 8, expiry_date: futureDate(3) });
    const middle = await createProduct(store, { name: "Sortprod 3", discounted_price: 5, expiry_date: futureDate(6) });
    const removed = await createProduct(store, { name: "Sortprod 4", discounted_price: 1, expiry_date: futureDate(1) });
    await pool.query("UPDATE products SET status = 'Removed' WHERE id = $1", [removed.id]);
    const list = async (query: Record<string, string>) =>
      ids((await admin.get("/api/admin/products").query({ q: "Sortprod", status: "Available", ...query })).body.products);

    expect(await list({ sort: "discounted_price", dir: "asc" })).toEqual([cheap.id, middle.id, dear.id]);
    expect(await list({ sort: "discounted_price", dir: "desc" })).toEqual([dear.id, middle.id, cheap.id]);
    expect(await list({ sort: "expiry_date", dir: "asc" })).toEqual([dear.id, middle.id, cheap.id]);
    expect(await list({ sort: "expiry_date", dir: "desc" })).toEqual([cheap.id, middle.id, dear.id]);
    // The status filter still applies, and so does the total.
    const filtered = await admin.get("/api/admin/products").query({ q: "Sortprod", status: "Available", sort: "expiry_date" });
    expect(filtered.body.total).toBe(3);

    // Equal prices: the id decides, so paging never repeats or skips a row.
    for (let i = 0; i < 4; i += 1) await createProduct(store, { name: `Sortprod same ${i}`, discounted_price: 5 });
    const query = { q: "Sortprod", sort: "discounted_price", dir: "desc" };
    const whole = await admin.get("/api/admin/products").query({ ...query, limit: 100 });
    const paged = await allPages("/api/admin/products", query, "products");
    expect(ids(paged)).toEqual(ids(whole.body.products));
    expect(new Set(ids(paged)).size).toBe(whole.body.total);
    expect(whole.body.total).toBe(8);
  });

  it("keeps the default product order (newest first) without sort", async () => {
    const store = await registerAndLogin(STORE, "STORE");
    const first = await createProduct(store, { name: "Sortprod old", discounted_price: 1 });
    const second = await createProduct(store, { name: "Sortprod new", discounted_price: 9 });
    await pool.query("UPDATE products SET created_at = NOW() - INTERVAL '1 day' WHERE id = $1", [first.id]);
    const response = await admin.get("/api/admin/products").query({ q: "Sortprod" });
    expect(ids(response.body.products)).toEqual([second.id, first.id]);
  });

  it("sorts reservations by pickup date", async () => {
    const store = await registerAndLogin(STORE, "STORE");
    const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    const product = await createProduct(store, { name: "Sortres", quantity: 10 });
    const reserveOn = async (days: number) =>
      (await restaurant.post("/api/reservations").send({ product_id: product.id, quantity: 1, pickup_date: futurePickup(days) }))
        .body.reservation.id as number;
    const later = await reserveOn(3);
    const soon = await reserveOn(1);
    const middle = await reserveOn(2);
    const list = async (query: Record<string, string>) =>
      ids((await admin.get("/api/admin/reservations").query({ q: "Sortres", ...query })).body.reservations);

    expect(await list({ sort: "pickup_date", dir: "asc" })).toEqual([soon, middle, later]);
    expect(await list({ sort: "pickup_date", dir: "desc" })).toEqual([later, middle, soon]);
    expect(await list({ sort: "pickup_date", status: "Pending" })).toEqual([soon, middle, later]);
    // Default: newest first.
    expect(await list({})).toEqual([middle, soon, later]);
  });

  it("sorts donations by their last day", async () => {
    const store = await registerAndLogin(STORE, "STORE");
    const late = await createDonation(store, { name: "Sortdon 1", expiry_date: futureDate(7) });
    const early = await createDonation(store, { name: "Sortdon 2", expiry_date: futureDate(2) });
    const list = async (query: Record<string, string>) =>
      ids((await admin.get("/api/admin/donations").query({ q: "Sortdon", ...query })).body.donations);

    expect(await list({ sort: "expiry_date", dir: "asc" })).toEqual([early.id, late.id]);
    expect(await list({ sort: "expiry_date", dir: "desc" })).toEqual([late.id, early.id]);
    expect(await list({ sort: "expiry_date", type: "FREE" })).toEqual([early.id, late.id]);
    expect(await list({})).toEqual([early.id, late.id]);
  });

  it.each([
    ["/api/admin/users", "created_at"],
    ["/api/admin/products", "expiry_date"],
    ["/api/admin/reservations", "pickup_date"],
    ["/api/admin/donations", "expiry_date"],
    ["/api/admin/credits/overview", "used"],
  ])("%s rejects an unknown sort key or direction", async (url, validKey) => {
    for (const query of [
      { sort: "name" },
      { sort: "id" },
      { sort: "expiry_date; DROP TABLE users" },
      { sort: "__proto__" },
      { sort: validKey, dir: "up" },
      { sort: validKey, dir: "ASC" },
      { dir: "sideways" },
      // A key of another table.
      { sort: url.endsWith("/users") ? "pickup_date" : "created_at" },
    ]) {
      const response = await admin.get(url).query(query);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid filter.");
    }
    const sorted = await admin.get(url).query({ sort: validKey, dir: "desc" });
    expect(sorted.status).toBe(200);
  });
});

describe("credit overview balances, sorting and the plan filter", () => {
  // A: Pro, 10 granted, 2 used.             total 10, used 2, available 8, usage 0.2
  // B: Pro, 4 granted, 3 charged, 1 refunded the same day.   total 4, used 2, available 2, usage 0.5
  // C: Standard, 6 granted, plus the refund of last month's charge.   total 7, used 0, available 7, usage 0
  // D: no subscription, +3 adjustment.      total 3, used 0, available 0, usage 0
  // E: restaurant without a subscription and without rows.   total 0, usage NULL
  // F: Pro without credits.                 total 0, usage NULL
  let a: number, b: number, c: number, d: number, e: number, f: number;
  let proId: number, standardId: number;

  beforeEach(async () => {
    const roles = ["STORE", "RESTAURANT", "RESTAURANT", "STORE", "RESTAURANT", "RESTAURANT"] as const;
    const credits = [10, 4, 6, null, null, 0];
    for (const [index, email] of CREDIT_USERS.entries()) {
      await insertUser(email, roles[index]!, `Sortcredit ${index}`, credits[index]);
    }
    [a, b, c, d, e, f] = await Promise.all(CREDIT_USERS.map(userId)) as [number, number, number, number, number, number];
    proId = (await pool.query("SELECT id FROM plans WHERE name = 'Pro'")).rows[0].id;
    standardId = (await pool.query("SELECT id FROM plans WHERE name = 'Standard'")).rows[0].id;
    await pool.query(
      "UPDATE subscriptions SET plan_id = $1 WHERE user_id = $2 AND period_month = $3",
      [standardId, c, creditMonth(new Date())],
    );

    // Five days before this credit month: always the month before.
    const lastMonth = new Date(new Date(`${creditMonth(new Date())}T12:00:00Z`).getTime() - 5 * 24 * 3600 * 1000);
    await giveSubscription(c, 3, lastMonth);
    const oldReservation = freshId();
    await inTransaction(async (client) => {
      await chargeForProduct(client, a, { id: freshId(), category: "Meat" });
      await chargeForProduct(client, a, { id: freshId(), category: "Fish" });
      const refunded = freshId();
      await chargeForReservation(client, b, { id: refunded, category: "Meat" });
      await chargeForReservation(client, b, { id: freshId(), category: "Meat" });
      await chargeForReservation(client, b, { id: freshId(), category: "Meat" });
      await refundForReservation(client, refunded, { forced: false });
      await chargeForReservation(client, c, { id: oldReservation, category: "Dairy" }, lastMonth);
      // Refunded this month: new credit now (Total), not less used.
      await refundForReservation(client, oldReservation, { forced: true });
      await adjustCredits(client, { userId: d, amount: 3, reason: "Goodwill", by: SYSTEM });
    });
  });

  const overview = async (query: Record<string, string> = {}) => {
    const response = await admin.get("/api/admin/credits/overview").query({ q: "Sortcredit", ...query });
    expect(response.status).toBe(200);
    return response.body as {
      users: { id: number; has_subscription: boolean; plan_name: string | null; total: number; used: number; available: number }[];
      total: number;
    };
  };

  it("returns the same numbers as getBalance for every user", async () => {
    const { users } = await overview();
    expect(users).toHaveLength(6);
    for (const row of users) {
      const balance = await getBalance(pool, row.id);
      expect(row).toMatchObject({
        has_subscription: balance.hasActiveSubscription,
        plan_name: balance.subscription?.plan_name ?? null,
        total: balance.total,
        used: balance.used,
        available: balance.available,
      });
    }
    const byId = new Map(users.map((row) => [row.id, row]));
    expect(byId.get(a)).toMatchObject({ plan_name: "Pro", total: 10, used: 2, available: 8 });
    expect(byId.get(b)).toMatchObject({ total: 4, used: 2, available: 2 });
    expect(byId.get(c)).toMatchObject({ plan_name: "Standard", total: 7, used: 0, available: 7 });
    expect(byId.get(d)).toMatchObject({ has_subscription: false, plan_name: null, total: 3, used: 0, available: 0 });
    expect(byId.get(e)).toMatchObject({ has_subscription: false, total: 0, used: 0, available: 0 });
    expect(byId.get(f)).toMatchObject({ has_subscription: true, plan_name: "Pro", total: 0, available: 0 });
  });

  it("keeps the default order (business name) without sort", async () => {
    expect(ids((await overview()).users)).toEqual([a, b, c, d, e, f]);
  });

  it.each([
    // Ties are broken by id, newest first.
    ["used", "asc", () => [f, e, d, c, b, a]],
    ["used", "desc", () => [b, a, f, e, d, c]],
    ["total", "asc", () => [f, e, d, b, c, a]],
    ["total", "desc", () => [a, c, b, d, f, e]],
    ["available", "asc", () => [f, e, d, b, c, a]],
    ["available", "desc", () => [a, c, b, f, e, d]],
    // No usage (total 0) sorts last in both directions.
    ["usage", "asc", () => [d, c, a, b, f, e]],
    ["usage", "desc", () => [b, a, d, c, f, e]],
  ])("sorts by %s %s over all pages", async (sort, dir, expected) => {
    expect(ids((await overview({ sort, dir })).users)).toEqual(expected());
    // Page by page (2 rows each) gives the same order with no row twice.
    const paged = await allPages("/api/admin/credits/overview", { q: "Sortcredit", sort, dir }, "users");
    expect(ids(paged)).toEqual(expected());
  });

  it("filters by plan, or by no subscription this month, together with role, search and sorting", async () => {
    const pro = await overview({ plan: String(proId) });
    expect(ids(pro.users)).toEqual([a, b, f]);
    expect(pro.total).toBe(3);
    expect(ids((await overview({ plan: String(standardId) })).users)).toEqual([c]);
    expect(ids((await overview({ plan: "none" })).users)).toEqual([d, e]);
    expect(ids((await overview({ plan: "none", role: "STORE" })).users)).toEqual([d]);
    expect(ids((await overview({ plan: "none", sort: "total", dir: "asc" })).users)).toEqual([e, d]);
    expect(ids((await overview({ plan: String(proId), sort: "usage", dir: "desc" })).users)).toEqual([b, a, f]);
    expect((await overview({ plan: "" })).total).toBe(6);
    // A plan nobody has.
    expect((await overview({ plan: "999999" })).total).toBe(0);
    for (const plan of ["abc", "0", "-1", "None"]) {
      const response = await admin.get("/api/admin/credits/overview").query({ plan });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid filter.");
    }
  });

  it("lists the active plans for the plan filter, to admins only", async () => {
    const response = await admin.get("/api/admin/credits/plans");
    expect(response.status).toBe(200);
    expect(response.body.plans.map((plan: { name: string }) => plan.name)).toEqual(["Basic", "Standard", "Pro"]);
    const store = await login(CREDIT_USERS[0]!);
    expect((await store.get("/api/admin/credits/plans")).status).toBe(403);
  });

  it("counts the matching users in total, not the page", async () => {
    const response = await admin.get("/api/admin/credits/overview").query({ q: "Sortcredit", sort: "used", limit: 2 });
    expect(response.body.users).toHaveLength(2);
    expect(response.body.total).toBe(6);
  });
});

describe("admin page size", () => {
  it("defaults the admin lists to 20 rows", async () => {
    for (let i = 0; i < 21; i += 1) await insertUser(`sorting-many-${i}@test.com`, "STORE", `Sortmany ${i}`, null);
    try {
      const users = await admin.get("/api/admin/users").query({ q: "sorting-many" });
      expect(users.body.users).toHaveLength(20);
      expect(users.body.total).toBe(21);
      const credits = await admin.get("/api/admin/credits/overview").query({ q: "Sortmany" });
      expect(credits.body.users).toHaveLength(20);
      expect(credits.body.total).toBe(21);
    } finally {
      await cleanupUsers(Array.from({ length: 21 }, (_, i) => `sorting-many-${i}@test.com`));
    }
  });

  it("keeps the store and restaurant defaults", async () => {
    const store = await registerAndLogin(STORE, "STORE");
    for (let i = 0; i < 13; i += 1) await createProduct(store, { name: `Sortsize ${i}` });
    expect((await store.get("/api/products/mine")).body.products).toHaveLength(12);
    const restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    expect((await restaurant.get("/api/products").query({ name: "Sortsize" })).body.products).toHaveLength(12);
  });
});
