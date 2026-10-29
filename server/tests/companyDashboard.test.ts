import pool from "../src/config/db.js";
import { creditMonth, monthEnd } from "../src/utils/creditTime.js";
import {
  type Agent,
  cleanupCompanies,
  cleanupUsers,
  insertCompany,
  insertUser,
  login,
  userId,
} from "./helpers.js";

// The headquarters' dashboard only reads: what waits for its decision, the company's totals and a
// row per branch, with the same numbers as the branch and credits endpoints.

const HQ = "codash-hq@test.com";
const OTHER_HQ = "codash-other-hq@test.com";
const CENTAR = "codash-centar@test.com";
const BREZA = "codash-breza@test.com";
const CLOSED = "codash-closed@test.com";
const OTHER_BRANCH = "codash-other-branch@test.com";
const RESTAURANT_A = "codash-restaurant-a@test.com";
const RESTAURANT_B = "codash-restaurant-b@test.com";
const STORE = "codash-store@test.com";
const RESTAURANT_USER = "codash-restaurant-user@test.com";
const EMAILS = [HQ, OTHER_HQ, CENTAR, BREZA, CLOSED, OTHER_BRANCH, RESTAURANT_A, RESTAURANT_B, STORE, RESTAURANT_USER];

const COMPANY = "Codash Chain";
const OTHER_COMPANY = "Codash Other Chain";
const CURRENT = creditMonth(new Date());

let hq: Agent;
let companyId: number;
let centarId: number;
let brezaId: number;
let closedId: number;
let otherBranchId: number;
let planId: number;
let topupId: number;

const insertProduct = async (storeId: number, unit = "kg", originalPrice = 10) => {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO products (store_id, name, category, original_price, discounted_price, quantity, unit, expiry_date)
     VALUES ($1, 'Codash Product', 'Bakery', $2, 5, 100, $3, CURRENT_DATE + 3) RETURNING id`,
    [storeId, originalPrice, unit],
  );
  return result.rows[0]!.id;
};

// A reservation of a new product of the store: picked up this month (or last month), or still open.
const insertReservation = async (
  storeId: number,
  restaurantEmail: string,
  { status = "Completed", lastMonth = false, quantity = 2, unitPrice = 5, unit = "kg" } = {},
) => {
  const productId = await insertProduct(storeId, unit);
  const at = lastMonth ? "date_trunc('month', CURRENT_DATE) - interval '1 day' + time '12:00'" : "NOW()";
  await pool.query(
    `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date, picked_up_at, created_at)
     VALUES ($1, $2, $3, $4, $5::reservation_status, ${at},
             CASE WHEN $5::reservation_status = 'Completed' THEN ${at} END, ${at})`,
    [productId, await userId(restaurantEmail), quantity, unitPrice, status],
  );
};

// Credits a branch used this month (a charge in the ledger).
const useCredits = async (id: number, amount: number) => {
  await pool.query(
    `INSERT INTO credit_transactions (user_id, period_month, amount, type, actor)
     VALUES ($1, $2, $3, 'PRODUCT_CHARGE', 'SYSTEM')`,
    [id, CURRENT, -amount],
  );
};

const dashboard = async (agent: Agent = hq) => {
  const response = await agent.get("/api/company/dashboard");
  expect(response.status).toBe(200);
  return response.body;
};

const decisionsOf = (body: { decisions: { type: string; branch_id: number }[] }, type: string) =>
  body.decisions.filter((decision) => decision.type === type).map((decision) => decision.branch_id);

beforeAll(async () => {
  planId = (await pool.query("SELECT id FROM plans WHERE name = 'Standard'")).rows[0].id;
  topupId = (await pool.query("SELECT id FROM topup_packages WHERE credits = 20")).rows[0].id;
});

beforeEach(async () => {
  companyId = await insertCompany(COMPANY);
  const otherCompanyId = await insertCompany(OTHER_COMPANY);
  await insertUser(HQ, "COMPANY", null, null, companyId);
  await insertUser(OTHER_HQ, "COMPANY", null, null, otherCompanyId);
  // Centar has this month's plan with 10 credits; Breza and the closed branch have none.
  await insertUser(CENTAR, "STORE", "Codash Centar", 10, companyId);
  await insertUser(BREZA, "STORE", "Codash Breza", null, companyId);
  await insertUser(CLOSED, "STORE", "Codash Zatvorena", null, companyId);
  await insertUser(OTHER_BRANCH, "STORE", "Codash Other", 10, otherCompanyId);
  await insertUser(RESTAURANT_A, "RESTAURANT", "Codash Restoran A");
  await insertUser(RESTAURANT_B, "RESTAURANT", "Codash Restoran B");
  centarId = await userId(CENTAR);
  brezaId = await userId(BREZA);
  closedId = await userId(CLOSED);
  otherBranchId = await userId(OTHER_BRANCH);
  await pool.query("UPDATE users SET deactivated_at = NOW() WHERE id = $1", [closedId]);
  hq = await login(HQ);
});

afterEach(async () => {
  vi.useRealTimers();
  await cleanupUsers(EMAILS);
  await cleanupCompanies([COMPANY, OTHER_COMPANY]);
});

describe("GET /api/company/dashboard", () => {
  it("is only for the headquarters", async () => {
    await insertUser(STORE, "STORE", "Codash Store");
    await insertUser(RESTAURANT_USER, "RESTAURANT", "Codash Restaurant");
    expect((await (await login(STORE)).get("/api/company/dashboard")).status).toBe(403);
    expect((await (await login(RESTAURANT_USER)).get("/api/company/dashboard")).status).toBe(403);
    expect((await (await login(CENTAR)).get("/api/company/dashboard")).status).toBe(403);
  });

  it("lists every branch of the caller's company with its status, and no other company's", async () => {
    const body = await dashboard();
    expect(body.message).toBe("Dashboard fetched successfully.");
    expect(body.company).toEqual({ id: companyId, name: COMPANY });
    expect(body.periodStart).toBe(CURRENT);
    expect(body.periodEnd).toBe(monthEnd(CURRENT));
    expect(body.branches.map((branch: { id: number; status: string }) => [branch.id, branch.status])).toEqual([
      [brezaId, "active"],
      [centarId, "active"],
      [closedId, "deactivated"],
    ]);
    expect(JSON.stringify(body)).not.toContain("Codash Other");
    expect(body.totals.branches).toEqual({ active: 2, all: 3, deactivated: 1 });

    const other = await dashboard(await login(OTHER_HQ));
    expect(other.branches.map((branch: { id: number }) => branch.id)).toEqual([otherBranchId]);
  });

  describe("decisions", () => {
    it("lists a branch's top-up waiting for the headquarters", async () => {
      const response = await (await login(CENTAR))
        .post("/api/credits/requests")
        .send({ request_type: "TOPUP", topup_package_id: topupId });
      expect(response.status).toBe(201);

      const [decision] = (await dashboard()).decisions;
      expect(decision).toMatchObject({
        type: "TOPUP_REVIEW",
        branch_id: centarId,
        branch_name: "Codash Centar",
        request: { id: response.body.request.id, status: "COMPANY_REVIEW", credits: 20 },
      });
      expect(JSON.stringify(decision)).not.toContain("admin_note");

      await hq.post(`/api/company/credits/branch-requests/${response.body.request.id}/approve`);
      expect(decisionsOf(await dashboard(), "TOPUP_REVIEW")).toEqual([]);
    });

    it("lists active branches without a plan this month, unless a plan was asked for", async () => {
      expect(decisionsOf(await dashboard(), "NO_PLAN")).toEqual([brezaId]);

      const asked = await hq
        .post(`/api/company/branches/${brezaId}/credits/requests`)
        .send({ request_type: "SUBSCRIPTION", plan_id: planId, period: "current" });
      expect(asked.status).toBe(201);
      expect(decisionsOf(await dashboard(), "NO_PLAN")).toEqual([]);
    });

    it("lists branches with 90% or more of the month's credits used", async () => {
      await useCredits(centarId, 8);
      expect(decisionsOf(await dashboard(), "LOW_CREDITS")).toEqual([]);

      await useCredits(centarId, 1);
      const body = await dashboard();
      expect(body.decisions.find((decision: { type: string }) => decision.type === "LOW_CREDITS")).toEqual({
        type: "LOW_CREDITS",
        branch_id: centarId,
        branch_name: "Codash Centar",
        used: 9,
        total: 10,
      });
    });

    describe("renewals", () => {
      // The API reads the real clock, so only Date is faked; the session is opened at the faked time.
      const at = async (instant: string) => {
        vi.useFakeTimers({ toFake: ["Date"], now: new Date(instant) });
        hq = await login(HQ);
      };

      it("lists, in the renewal window, active branches without next month's plan or request", async () => {
        await at(`${monthEnd(CURRENT)}T12:00:00Z`);
        const body = await dashboard();
        expect(body.renewalWindow).toBe(true);
        expect(decisionsOf(body, "RENEWAL")).toEqual([brezaId, centarId]);

        const asked = await hq
          .post(`/api/company/branches/${centarId}/credits/requests`)
          .send({ request_type: "SUBSCRIPTION", plan_id: planId, period: "next" });
        expect(asked.status).toBe(201);
        expect(decisionsOf(await dashboard(), "RENEWAL")).toEqual([brezaId]);
      });

      it("lists none before the renewal window", async () => {
        await at(`${CURRENT}T12:00:00Z`);
        const body = await dashboard();
        expect(body.renewalWindow).toBe(false);
        expect(decisionsOf(body, "RENEWAL")).toEqual([]);
      });
    });

    it("asks nothing for a deactivated branch", async () => {
      await pool.query("UPDATE users SET deactivated_at = NOW() WHERE id = $1", [centarId]);
      await useCredits(centarId, 10);
      const body = await dashboard();
      expect(body.decisions.map((decision: { branch_id: number }) => decision.branch_id)).toEqual([brezaId]);
    });
  });

  describe("totals", () => {
    beforeEach(async () => {
      await useCredits(centarId, 3);
      await insertReservation(centarId, RESTAURANT_A, { quantity: 2, unitPrice: 5 });
      await insertReservation(centarId, RESTAURANT_B, { quantity: 500, unitPrice: 0.01, unit: "g" });
      await insertReservation(centarId, RESTAURANT_A, { status: "Pending" });
      await insertReservation(brezaId, RESTAURANT_A, { quantity: 3, unitPrice: 2, unit: "kom" });
      await insertReservation(brezaId, RESTAURANT_B, { quantity: 1.5, unitPrice: 4, unit: "l" });
      await insertReservation(brezaId, RESTAURANT_B, { lastMonth: true, quantity: 7 });
      await insertReservation(closedId, RESTAURANT_A, { quantity: 1, unitPrice: 3 });
      await insertReservation(otherBranchId, RESTAURANT_A, { quantity: 9, unitPrice: 9 });
    });

    it("counts this month's reservations and picked-up food, deactivated branches included", async () => {
      const body = await dashboard();
      expect(body.totals.reservations).toEqual({ total: 6, picked_up: 5, pending: 1 });
      // kg: 2 + 0.5 + 1 (closed); l: 1.5; pieces: 3. Value: 10 + 5 + 6 + 6 + 3.
      expect(body.totals.saved).toEqual({ kg: 3.5, l: 1.5, pieces: 3, value: 30 });
      expect(body.totals.credits).toEqual({ used: 3, total: 10 });
      const closed = body.branches.find((branch: { id: number }) => branch.id === closedId);
      expect(closed).toMatchObject({ status: "deactivated", completed_this_month: 1 });
    });

    it("matches the branch pages and the credit balances", async () => {
      const body = await dashboard();
      const sums = { reservations: 0, completed: 0, pending: 0, kg: 0, l: 0, pieces: 0, value: 0, used: 0, total: 0 };
      for (const row of body.branches) {
        const { stats } = (await hq.get(`/api/company/branches/${row.id}`)).body;
        expect(row).toMatchObject(stats);
        const { credits } = (await hq.get(`/api/company/branches/${row.id}/credits`)).body;
        expect([row.used, row.total]).toEqual([credits.used, credits.total]);
        sums.reservations += stats.reservations_this_month;
        sums.completed += stats.completed_this_month;
        sums.pending += stats.pending_reservations;
        sums.kg += stats.saved_this_month.kg;
        sums.l += stats.saved_this_month.l;
        sums.pieces += stats.saved_this_month.pieces;
        sums.value += stats.value_this_month;
        sums.used += credits.used;
        sums.total += credits.total;
      }
      expect(body.totals.reservations).toEqual({
        total: sums.reservations,
        picked_up: sums.completed,
        pending: sums.pending,
      });
      expect(body.totals.saved).toEqual({ kg: sums.kg, l: sums.l, pieces: sums.pieces, value: sums.value });
      expect(body.totals.credits).toEqual({ used: sums.used, total: sums.total });
      expect(body.totals.credits).toEqual({
        used: (await hq.get("/api/company/credits")).body.totals.used,
        total: (await hq.get("/api/company/credits")).body.totals.total,
      });
    });
  });
});
