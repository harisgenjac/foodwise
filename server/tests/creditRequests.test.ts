import pool from "../src/config/db.js";
import { runCreditRenewals } from "../src/jobs/creditRenewals.js";
import { creditMonth, nextMonth } from "../src/utils/creditTime.js";
import {
  type Agent,
  cleanupUsers,
  createProduct,
  giveSubscription,
  insertUser,
  login,
  registerAndLogin,
  userId,
} from "./helpers.js";

const STORE = "creditreq-store@test.com";
const RESTAURANT = "creditreq-restaurant@test.com";
const ADMIN = "creditreq-admin@test.com";
const BLOCKED_ADMIN = "creditreq-blocked-admin@test.com";

const CURRENT = creditMonth(new Date());

let store: Agent;
let restaurant: Agent;
let admin: Agent;
let storeId: number;
let restaurantId: number;
let planId: number;
let topupId: number;

const notificationsOf = async (id: number, type: string) =>
  (await pool.query("SELECT * FROM notifications WHERE user_id = $1 AND type = $2", [id, type])).rows;

const subscribe = (agent: Agent, overrides: Record<string, unknown> = {}) =>
  agent.post("/api/credits/requests").send({ request_type: "SUBSCRIPTION", plan_id: planId, period: "current", ...overrides });

beforeAll(async () => {
  planId = (await pool.query("SELECT id FROM plans WHERE name = 'Standard'")).rows[0].id;
  topupId = (await pool.query("SELECT id FROM topup_packages WHERE credits = 20")).rows[0].id;
});

beforeEach(async () => {
  // The store starts without a subscription; the restaurant has one with 5 credits.
  await insertUser(STORE, "STORE", "Credit Store", null);
  await insertUser(RESTAURANT, "RESTAURANT", "Credit Restaurant", 5);
  store = await login(STORE);
  restaurant = await login(RESTAURANT);
  admin = await registerAndLogin(ADMIN, "ADMIN");
  storeId = await userId(STORE);
  restaurantId = await userId(RESTAURANT);
});

afterEach(async () => {
  await cleanupUsers([STORE, RESTAURANT, ADMIN, BLOCKED_ADMIN]);
});

describe("plans and balance", () => {
  it("lists the active plans and top-up packages", async () => {
    const plans = await store.get("/api/credits/plans");
    expect(plans.body.plans.map((plan: { credits_per_period: number }) => plan.credits_per_period)).toEqual([20, 50, 150]);
    const packages = await store.get("/api/credits/topup-packages");
    expect(packages.body.packages.map((topup: { credits: number }) => topup.credits)).toEqual([10, 20, 50]);
  });

  it("returns the balance, next month's subscription and pending requests", async () => {
    const response = await restaurant.get("/api/credits/me");
    expect(response.status).toBe(200);
    expect(response.body.credits).toMatchObject({
      periodStart: CURRENT,
      hasActiveSubscription: true,
      total: 5,
      used: 0,
      available: 5,
      nextSubscription: null,
      pendingRequests: [],
    });
  });

  it("is only for stores and restaurants", async () => {
    expect((await admin.get("/api/credits/me")).status).toBe(403);
    expect((await store.get("/api/admin/credits/overview")).status).toBe(403);
  });
});

describe("subscription requests", () => {
  it("creates a pending request and notifies every active admin", async () => {
    await insertUser(BLOCKED_ADMIN, "ADMIN");
    await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [BLOCKED_ADMIN]);

    const response = await subscribe(store, { auto_renew: true });
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Request sent.");
    expect(response.body.request).toMatchObject({
      request_type: "SUBSCRIPTION",
      status: "PENDING",
      period_month: CURRENT,
      auto_renew: true,
      plan_name: "Standard",
      credits: 50,
      source: "USER",
    });
    expect(response.body.request).not.toHaveProperty("admin_note");

    const adminId = await userId(ADMIN);
    expect(await notificationsOf(adminId, "CREDIT_REQUEST_CREATED")).toMatchObject([
      { credit_request_id: response.body.request.id },
    ]);
    expect(await notificationsOf(await userId(BLOCKED_ADMIN), "CREDIT_REQUEST_CREATED")).toHaveLength(0);

    const list = await admin.get("/api/notifications");
    expect(list.body.notifications[0]).toMatchObject({
      type: "CREDIT_REQUEST_CREATED",
      credit_request_type: "SUBSCRIPTION",
      credit_amount: 50,
      credit_requester: "Credit Store",
    });
  });

  it("allows one pending subscription request per month", async () => {
    expect((await subscribe(store)).status).toBe(201);
    const second = await subscribe(store);
    expect(second.status).toBe(400);
    expect(second.body.error).toBe("You already have a pending subscription request for this month.");
    // The next month is a different month.
    expect((await subscribe(store, { period: "next" })).status).toBe(201);
  });

  it("refuses a request for a month that already has a subscription", async () => {
    const response = await subscribe(restaurant);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("You already have a subscription for this month.");
    expect((await subscribe(restaurant, { period: "next" })).status).toBe(201);
  });

  it("validates the request", async () => {
    expect((await store.post("/api/credits/requests").send({ request_type: "GIFT" })).body.error).toBe(
      "Request type is not valid.",
    );
    expect((await subscribe(store, { period: "later" })).body.error).toBe("Period is not valid.");
    expect((await subscribe(store, { plan_id: 999999 })).status).toBe(404);
    expect((await subscribe(store, { auto_renew: "yes" })).body.error).toBe("Auto-renew must be true or false.");
  });

  it("lets the user withdraw only their own pending request", async () => {
    const request = (await subscribe(store)).body.request;
    expect((await restaurant.delete(`/api/credits/requests/${request.id}`)).status).toBe(403);
    const withdrawn = await store.delete(`/api/credits/requests/${request.id}`);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.request.status).toBe("CANCELLED");
    const again = await store.delete(`/api/credits/requests/${request.id}`);
    expect(again.body.error).toBe("Only pending requests can be withdrawn.");
    expect((await store.delete("/api/credits/requests/999999")).status).toBe(404);
  });
});

describe("top-up requests", () => {
  const topup = (agent: Agent) =>
    agent.post("/api/credits/requests").send({ request_type: "TOPUP", topup_package_id: topupId });

  it("needs an active subscription for the current month", async () => {
    const response = await topup(store);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("An active subscription for the current month is required to buy extra credits.");
  });

  it("allows one pending top-up at a time", async () => {
    expect((await topup(restaurant)).status).toBe(201);
    const second = await topup(restaurant);
    expect(second.status).toBe(400);
    expect(second.body.error).toBe("You already have a pending top-up request.");
  });

  it("adds approved top-up credits to the current month", async () => {
    const request = (await topup(restaurant)).body.request;
    const approved = await admin.post(`/api/admin/credits/requests/${request.id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect((await restaurant.get("/api/credits/me")).body.credits).toMatchObject({ total: 25, available: 25 });
  });

  it("cannot be approved after its month has ended", async () => {
    const old = await pool.query(
      `INSERT INTO credit_requests (user_id, request_type, topup_package_id, period_month)
       VALUES ($1, 'TOPUP', $2, '2020-01-01') RETURNING id`,
      [restaurantId, topupId],
    );
    const response = await admin.post(`/api/admin/credits/requests/${old.rows[0].id}/approve`).send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("This month has already ended.");
  });
});

describe("admin decisions", () => {
  it("approves a subscription: subscription, credits, audit log and a notification without the note", async () => {
    const request = (await subscribe(store, { auto_renew: true })).body.request;
    const approved = await admin
      .post(`/api/admin/credits/requests/${request.id}/approve`)
      .send({ note: "Paid in cash, receipt 42" });
    expect(approved.status).toBe(200);
    expect(approved.body.message).toBe("Request approved.");

    const credits = (await store.get("/api/credits/me")).body.credits;
    expect(credits).toMatchObject({ hasActiveSubscription: true, total: 50, available: 50 });
    expect(credits.subscription).toMatchObject({ plan_name: "Standard", auto_renew: true });
    expect((await createProduct(store)).id).toBeGreaterThan(0);

    const [notification] = await notificationsOf(storeId, "CREDIT_REQUEST_APPROVED");
    expect(notification).toMatchObject({ credit_request_id: request.id, details: null });
    const actions = await pool.query(
      "SELECT * FROM admin_actions WHERE target_credit_request_id = $1",
      [request.id],
    );
    expect(actions.rows).toMatchObject([{ action: "APPROVE_CREDIT_REQUEST", target_user_id: storeId }]);

    // The internal note never reaches the user.
    const mine = await store.get("/api/credits/requests");
    expect(mine.body.requests[0]).toMatchObject({ status: "APPROVED" });
    expect(JSON.stringify(mine.body)).not.toContain("receipt 42");
    expect(JSON.stringify((await store.get("/api/notifications")).body)).not.toContain("receipt 42");
    const adminList = await admin.get("/api/admin/credits/requests");
    expect(adminList.body.requests[0]).toMatchObject({ admin_note: "Paid in cash, receipt 42", user_email: STORE });
  });

  it("approves a request for next month without touching this month", async () => {
    const request = (await subscribe(restaurant, { period: "next" })).body.request;
    await admin.post(`/api/admin/credits/requests/${request.id}/approve`).send({});
    const credits = (await restaurant.get("/api/credits/me")).body.credits;
    expect(credits).toMatchObject({ total: 5, nextSubscription: { plan_name: "Standard" } });
  });

  it("rejects with a note, grants nothing and notifies the user", async () => {
    const request = (await subscribe(store)).body.request;
    const rejected = await admin.post(`/api/admin/credits/requests/${request.id}/reject`).send({ note: "No payment" });
    expect(rejected.status).toBe(200);
    expect((await store.get("/api/credits/me")).body.credits.hasActiveSubscription).toBe(false);
    expect(await notificationsOf(storeId, "CREDIT_REQUEST_REJECTED")).toHaveLength(1);
    const again = await admin.post(`/api/admin/credits/requests/${request.id}/approve`).send({});
    expect(again.body.error).toBe("Only pending requests can be approved or rejected.");
  });

  it("validates the note and the request id", async () => {
    const request = (await subscribe(store)).body.request;
    const long = await admin.post(`/api/admin/credits/requests/${request.id}/reject`).send({ note: "x".repeat(501) });
    expect(long.body.error).toBe("The note can be at most 500 characters long.");
    expect((await admin.post("/api/admin/credits/requests/999999/approve").send({})).status).toBe(404);
  });

  it("filters the request list and counts pending requests", async () => {
    await subscribe(store);
    await restaurant.post("/api/credits/requests").send({ request_type: "TOPUP", topup_package_id: topupId });
    const topups = await admin.get("/api/admin/credits/requests?type=TOPUP");
    expect(topups.body.requests.every((row: { request_type: string }) => row.request_type === "TOPUP")).toBe(true);
    const own = await admin.get(`/api/admin/credits/requests?user_id=${storeId}`);
    expect(own.body.total).toBe(1);
    expect((await admin.get("/api/admin/credits/requests?status=LOST")).status).toBe(400);
    const count = await admin.get("/api/admin/credits/requests/pending-count");
    expect(count.body.count).toBeGreaterThanOrEqual(2);
  });
});

describe("admin overview, adjustments and ledger", () => {
  it("treats empty filters as no filter (the client sends unused filters as ?role=)", async () => {
    await subscribe(store);
    const overview = await admin.get("/api/admin/credits/overview?role=&q=");
    expect(overview.status).toBe(200);
    expect(overview.body.users.map((row: { id: number }) => row.id)).toEqual(expect.arrayContaining([storeId, restaurantId]));
    const requests = await admin.get("/api/admin/credits/requests?type=&status=&user_id=");
    expect(requests.status).toBe(200);
    expect(requests.body.total).toBeGreaterThanOrEqual(1);
  });

  it("counts subscriptions, requests and used credits in the platform statistics", async () => {
    const stats = async () => (await admin.get("/api/admin/stats")).body.stats.credits;
    const before = await stats();
    expect(before.period_start).toBe(CURRENT);

    // The store gets a Standard subscription with auto-renew, then asks for next month.
    const request = (await subscribe(store, { auto_renew: true })).body.request;
    await admin.post(`/api/admin/credits/requests/${request.id}/approve`).send({});
    await subscribe(store, { period: "next" });
    const kept = await createProduct(store);
    const refunded = await createProduct(store);
    await store.delete(`/api/products/${refunded.id}`);
    expect(kept.id).toBeGreaterThan(0);

    const after = await stats();
    expect(after.active_subscriptions - before.active_subscriptions).toBe(1);
    expect(after.auto_renew - before.auto_renew).toBe(1);
    expect(after.without_subscription - before.without_subscription).toBe(-1);
    // The first request was approved; the one for next month is still pending.
    expect(after.pending_requests - before.pending_requests).toBe(1);
    // Two charges, one refunded the same day.
    expect(after.credits_used - before.credits_used).toBe(1);
    const standard = (rows: { plan: string; count: number }[]) => rows.find((row) => row.plan === "Standard")!.count;
    expect(standard(after.by_plan) - standard(before.by_plan)).toBe(1);
    expect(after.by_plan.map((row: { plan: string }) => row.plan)).toEqual(["Basic", "Standard", "Pro"]);
  });

  it("lists businesses with this month's plan and balance", async () => {
    const response = await admin.get("/api/admin/credits/overview?q=Credit");
    expect(response.status).toBe(200);
    const rows = response.body.users as { id: number }[];
    expect(rows.find((row) => row.id === restaurantId)).toMatchObject({
      plan_name: "Pro",
      has_subscription: true,
      total: 5,
      used: 0,
      available: 5,
    });
    expect(rows.find((row) => row.id === storeId)).toMatchObject({ has_subscription: false, available: 0 });
    const restaurants = await admin.get("/api/admin/credits/overview?role=RESTAURANT&q=Credit");
    expect(restaurants.body.users.map((row: { id: number }) => row.id)).toEqual([restaurantId]);
    expect((await admin.get("/api/admin/credits/overview?role=ADMIN")).status).toBe(400);
  });

  it("adjusts credits with a reason and never below zero", async () => {
    const added = await admin.post(`/api/admin/credits/users/${restaurantId}/adjust`).send({ amount: 3, reason: "Goodwill" });
    expect(added.status).toBe(200);
    expect(added.body.balance.available).toBe(8);
    const tooMuch = await admin.post(`/api/admin/credits/users/${restaurantId}/adjust`).send({ amount: -9, reason: "Fix" });
    expect(tooMuch.body.error).toBe("The balance cannot go below zero.");
    expect((await admin.post(`/api/admin/credits/users/${restaurantId}/adjust`).send({ amount: 2 })).body.error).toBe(
      "A reason is required (at most 500 characters).",
    );
    expect((await admin.post(`/api/admin/credits/users/${restaurantId}/adjust`).send({ amount: 1.5, reason: "x" })).body.error).toBe(
      "Amount must be a whole number other than zero.",
    );
    const adminId = await userId(ADMIN);
    expect((await admin.post(`/api/admin/credits/users/${adminId}/adjust`).send({ amount: 1, reason: "x" })).body.error).toBe(
      "Credits apply only to stores and restaurants.",
    );
    const log = await pool.query("SELECT reason FROM admin_actions WHERE action = 'ADJUST_CREDITS' AND target_user_id = $1", [
      restaurantId,
    ]);
    expect(log.rows).toEqual([{ reason: "+3: Goodwill" }]);
  });

  it("shows a user's ledger, newest first", async () => {
    await admin.post(`/api/admin/credits/users/${restaurantId}/adjust`).send({ amount: 2, reason: "Bonus" });
    const response = await admin.get(`/api/admin/credits/users/${restaurantId}/ledger`);
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.transactions[0]).toMatchObject({ type: "ADMIN_ADJUSTMENT", amount: 2, created_by_email: ADMIN });
    expect(response.body.balance.available).toBe(7);
    expect((await admin.get("/api/admin/credits/users/999999/ledger")).status).toBe(404);
  });
});

describe("usage history", () => {
  it("returns 12 months and the categories of the year", async () => {
    await giveSubscription(storeId, 3);
    await createProduct(store, { category: "Fish" });
    await createProduct(store, { category: "Fish" });
    await createProduct(store, { category: "Meat" });
    const response = await store.get("/api/credits/me/history");
    expect(response.status).toBe(200);
    const { months, categories, year } = response.body.history;
    expect(year).toBe(Number(CURRENT.slice(0, 4)));
    expect(months).toHaveLength(12);
    expect(months.find((month: { month: string }) => month.month === CURRENT)).toEqual({
      month: CURRENT,
      hasSubscription: true,
      total: 3,
      used: 3,
    });
    expect(categories).toEqual([
      { category: "Fish", used: 2 },
      { category: "Meat", used: 1 },
    ]);
    expect((await store.get("/api/credits/me/history?year=abc")).status).toBe(400);
  });
});

describe("auto-renew", () => {
  // June 2030 has 30 days: the 29th is 2 days before July starts (London time).
  const JUNE_28 = new Date("2030-06-28T12:00:00Z");
  const JUNE_29 = new Date("2030-06-29T12:00:00Z");

  const renewals = async (id: number) =>
    (
      await pool.query(
        "SELECT * FROM credit_requests WHERE user_id = $1 AND source = 'AUTO_RENEW' ORDER BY id",
        [id],
      )
    ).rows;

  beforeEach(async () => {
    const subscription = await giveSubscription(storeId, 10, JUNE_28);
    await pool.query("UPDATE subscriptions SET auto_renew = true WHERE id = $1", [subscription]);
  });

  it("creates next month's request 2 days before the month starts, only once", async () => {
    await runCreditRenewals(JUNE_28);
    expect(await renewals(storeId)).toHaveLength(0);

    await runCreditRenewals(JUNE_29);
    expect(await renewals(storeId)).toMatchObject([
      { period_month: "2030-07-01", status: "PENDING", auto_renew: true, plan_id: expect.any(Number) },
    ]);
    const [renewal] = await renewals(storeId);
    expect(await notificationsOf(await userId(ADMIN), "CREDIT_REQUEST_CREATED")).toMatchObject([
      { credit_request_id: renewal.id },
    ]);

    await runCreditRenewals(new Date("2030-06-30T12:00:00Z"));
    expect(await renewals(storeId)).toHaveLength(1);

    // Withdrawn or rejected renewals are not created again either.
    await pool.query("UPDATE credit_requests SET status = 'REJECTED' WHERE id = $1", [renewal.id]);
    await runCreditRenewals(new Date("2030-06-30T12:00:00Z"));
    expect(await renewals(storeId)).toHaveLength(1);
  });

  it("skips users with their own pending request for next month or who are blocked", async () => {
    await pool.query(
      `INSERT INTO credit_requests (user_id, request_type, plan_id, period_month)
       VALUES ($1, 'SUBSCRIPTION', $2, '2030-07-01')`,
      [storeId, planId],
    );
    const restaurantSubscription = await giveSubscription(restaurantId, 10, JUNE_28);
    await pool.query("UPDATE subscriptions SET auto_renew = true WHERE id = $1", [restaurantSubscription]);
    await pool.query("UPDATE users SET is_blocked = true WHERE id = $1", [restaurantId]);

    expect((await runCreditRenewals(JUNE_29)).created).toBe(0);
  });

  it("expires pending requests whose month has ended", async () => {
    const stale = await pool.query(
      `INSERT INTO credit_requests (user_id, request_type, plan_id, period_month)
       VALUES ($1, 'SUBSCRIPTION', $2, '2030-05-01') RETURNING id`,
      [storeId, planId],
    );
    await runCreditRenewals(JUNE_28);
    const row = await pool.query("SELECT status FROM credit_requests WHERE id = $1", [stale.rows[0].id]);
    expect(row.rows[0].status).toBe("EXPIRED");
  });

  it("turning auto-renew off keeps next month's plan and stops it renewing", async () => {
    const subscriptionRenews = async (month: string) =>
      (
        await pool.query("SELECT auto_renew FROM subscriptions WHERE user_id = $1 AND period_month = $2", [storeId, month])
      ).rows[0].auto_renew;
    const requestState = async (id: number) =>
      (await pool.query("SELECT auto_renew, status FROM credit_requests WHERE id = $1", [id])).rows[0];
    // The toggle works on current and future subscriptions, so give the store one this month.
    const current = await giveSubscription(storeId, 1);
    await pool.query("UPDATE subscriptions SET auto_renew = true WHERE id = $1", [current]);
    // A renewal from the job (for July 2030) and a plan the store asked for next month itself.
    await runCreditRenewals(JUNE_29);
    const [renewal] = await renewals(storeId);
    const own = (await subscribe(store, { period: "next", auto_renew: true })).body.request;
    expect(own.auto_renew).toBe(true);

    const off = await store.patch("/api/credits/subscription/auto-renew").send({ auto_renew: false });
    expect(off.status).toBe(200);
    expect(off.body.message).toBe("Auto-renew turned off.");
    expect(await subscriptionRenews(CURRENT)).toBe(false);
    expect(await requestState(renewal.id)).toEqual({ auto_renew: false, status: "PENDING" });
    expect(await requestState(own.id)).toEqual({ auto_renew: false, status: "PENDING" });

    // Approved later, next month's plan starts without auto-renew.
    expect((await admin.post(`/api/admin/credits/requests/${own.id}/approve`).send({})).status).toBe(200);
    expect(await subscriptionRenews(nextMonth(CURRENT))).toBe(false);

    // Turning it on again applies to the approved next month and the waiting renewal too.
    expect((await store.patch("/api/credits/subscription/auto-renew").send({ auto_renew: true })).status).toBe(200);
    expect(await subscriptionRenews(nextMonth(CURRENT))).toBe(true);
    expect(await requestState(renewal.id)).toEqual({ auto_renew: true, status: "PENDING" });
  });

  it("validates auto-renew and needs an active subscription", async () => {

    expect((await store.patch("/api/credits/subscription/auto-renew").send({ auto_renew: "no" })).status).toBe(400);
    await cleanupUsers([STORE]);
    await insertUser(STORE, "STORE", "Credit Store", null);
    const none = await (await login(STORE)).patch("/api/credits/subscription/auto-renew").send({ auto_renew: true });
    expect(none.status).toBe(404);
  });
});
