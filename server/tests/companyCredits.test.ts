import pool from "../src/config/db.js";
import { runCreditRenewals } from "../src/jobs/creditRenewals.js";
import { getBalance } from "../src/services/creditService.js";
import { creditMonth, nextMonth } from "../src/utils/creditTime.js";
import {
  type Agent,
  cleanupCompanies,
  cleanupUsers,
  giveSubscription,
  insertCompany,
  insertUser,
  login,
  registerAndLogin,
  userId,
} from "./helpers.js";

// The headquarters asks and pays for its branches' credits; the branch asks its headquarters for
// top-ups. Independent stores and restaurants keep their own requests.

const ADMIN = "cocredits-admin@test.com";
const HQ = "cocredits-hq@test.com";
const OTHER_HQ = "cocredits-other-hq@test.com";
const BRANCH = "cocredits-branch@test.com";
const SECOND_BRANCH = "cocredits-second@test.com";
const OTHER_BRANCH = "cocredits-other-branch@test.com";
const LONE_STORE = "cocredits-lone-store@test.com";
const RESTAURANT = "cocredits-restaurant@test.com";
const EMAILS = [ADMIN, HQ, OTHER_HQ, BRANCH, SECOND_BRANCH, OTHER_BRANCH, LONE_STORE, RESTAURANT];

const COMPANY = "Cocredits Chain";
const OTHER_COMPANY = "Cocredits Other Chain";
const CURRENT = creditMonth(new Date());

let admin: Agent;
let hq: Agent;
let otherHq: Agent;
let branch: Agent;
let companyId: number;
let branchId: number;
let secondId: number;
let otherBranchId: number;
let hqId: number;
let adminId: number;
let planId: number;
let topupId: number;

const notificationsOf = async (id: number, type?: string) =>
  (
    await pool.query(
      `SELECT notifications.type, notifications.message, notifications.details, notifications.credit_request_id,
              notifications.branch_id
       FROM notifications WHERE notifications.user_id = $1 AND ($2::text IS NULL OR notifications.type = $2)
       ORDER BY notifications.id`,
      [id, type ?? null],
    )
  ).rows;

const requestRow = async (id: number) =>
  (await pool.query("SELECT * FROM credit_requests WHERE id = $1", [id])).rows[0];

const topup = (agent: Agent) => agent.post("/api/credits/requests").send({ request_type: "TOPUP", topup_package_id: topupId });

const branchRequest = (agent: Agent, id: number, body: Record<string, unknown>) =>
  agent.post(`/api/company/branches/${id}/credits/requests`).send(body);

// Every response body as text, to check that admin_note never leaks.
const noAdminNote = (body: unknown) => expect(JSON.stringify(body)).not.toContain("admin_note");

beforeAll(async () => {
  planId = (await pool.query("SELECT id FROM plans WHERE name = 'Standard'")).rows[0].id;
  topupId = (await pool.query("SELECT id FROM topup_packages WHERE credits = 20")).rows[0].id;
});

beforeEach(async () => {
  admin = await registerAndLogin(ADMIN, "ADMIN");
  adminId = await userId(ADMIN);
  companyId = await insertCompany(COMPANY);
  const otherCompanyId = await insertCompany(OTHER_COMPANY);
  await insertUser(HQ, "COMPANY", null, null, companyId);
  await insertUser(OTHER_HQ, "COMPANY", null, null, otherCompanyId);
  // The branch has this month's plan with 10 credits; the second branch has none yet.
  await insertUser(BRANCH, "STORE", "Cocredits Centar", 10, companyId);
  await insertUser(SECOND_BRANCH, "STORE", "Cocredits Breza", null, companyId);
  await insertUser(OTHER_BRANCH, "STORE", "Cocredits Other", 10, otherCompanyId);
  branchId = await userId(BRANCH);
  secondId = await userId(SECOND_BRANCH);
  otherBranchId = await userId(OTHER_BRANCH);
  hqId = await userId(HQ);
  hq = await login(HQ);
  otherHq = await login(OTHER_HQ);
  branch = await login(BRANCH);
});

afterEach(async () => {
  await cleanupUsers(EMAILS);
  await cleanupCompanies([COMPANY, OTHER_COMPANY]);
});

describe("the branch", () => {
  it("cannot ask for a plan or change auto-renew", async () => {
    const plan = await branch
      .post("/api/credits/requests")
      .send({ request_type: "SUBSCRIPTION", plan_id: planId, period: "next" });
    expect(plan.status).toBe(403);
    expect(plan.body.error).toBe("Your company manages your plan.");
    const renew = await branch.patch("/api/credits/subscription/auto-renew").send({ auto_renew: true });
    expect(renew.status).toBe(403);
    expect(renew.body.error).toBe("Your company manages your plan.");
    expect((await pool.query("SELECT 1 FROM credit_requests WHERE user_id = $1", [branchId])).rows).toHaveLength(0);
  });

  it("sees that its company manages the plan", async () => {
    const response = await branch.get("/api/credits/me");
    expect(response.body.credits).toMatchObject({
      managedByCompany: true,
      companyName: COMPANY,
      hasActiveSubscription: true,
      available: 10,
    });
  });

  it("sends a top-up request to its headquarters, not to the admin", async () => {
    const response = await topup(branch);
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Request sent to your company.");
    expect(response.body.request).toMatchObject({
      status: "COMPANY_REVIEW",
      source: "BRANCH",
      requested_by: branchId,
      credits: 20,
    });
    noAdminNote(response.body);
    const id = response.body.request.id;
    expect(await notificationsOf(hqId, "BRANCH_TOPUP_REQUESTED")).toMatchObject([
      { credit_request_id: id, branch_id: branchId },
    ]);
    expect(await notificationsOf(adminId)).toEqual([]);
    // Not in the admin's list or badge while it waits for the headquarters.
    const list = await admin.get(`/api/admin/credits/requests?user_id=${branchId}`);
    expect(list.body.requests).toEqual([]);
    expect((await admin.get("/api/admin/credits/requests/pending-count")).body.count).toBe(0);
    // The branch's open requests include it.
    const me = await branch.get("/api/credits/me");
    expect(me.body.credits.pendingRequests).toMatchObject([{ id, status: "COMPANY_REVIEW" }]);
  });

  it("needs this month's plan to ask for a top-up", async () => {
    const second = await login(SECOND_BRANCH);
    const response = await topup(second);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("An active subscription for the current month is required to buy extra credits.");
  });

  it("has one open top-up, whether it waits for the headquarters or the admin", async () => {
    const first = await topup(branch);
    const again = await topup(branch);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("You already have a pending top-up request.");

    await hq.post(`/api/company/credits/branch-requests/${first.body.request.id}/approve`);
    expect((await topup(branch)).body.error).toBe("You already have a pending top-up request.");
    // The headquarters cannot add a second one either.
    const byHq = await branchRequest(hq, branchId, { request_type: "TOPUP", topup_package_id: topupId });
    expect(byHq.status).toBe(400);
    expect(byHq.body.error).toBe("You already have a pending top-up request.");
  });

  it("withdraws a top-up while it waits for the headquarters, but not once it is at the admin", async () => {
    const first = await topup(branch);
    const withdrawn = await branch.delete(`/api/credits/requests/${first.body.request.id}`);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.request.status).toBe("CANCELLED");
    // A withdrawn branch request never shows to the admin.
    expect((await admin.get(`/api/admin/credits/requests?user_id=${branchId}`)).body.requests).toEqual([]);

    const second = await topup(branch);
    await hq.post(`/api/company/credits/branch-requests/${second.body.request.id}/approve`);
    const refused = await branch.delete(`/api/credits/requests/${second.body.request.id}`);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe("Your company manages your plan.");
  });
});

describe("the headquarters deciding a branch's top-up", () => {
  it("approves it: a pending top-up for the admin, sent by the headquarters", async () => {
    const id = (await topup(branch)).body.request.id;
    const list = await hq.get("/api/company/credits/branch-requests");
    expect(list.body.requests).toMatchObject([{ id, branch_name: "Cocredits Centar", status: "COMPANY_REVIEW" }]);
    expect((await hq.get("/api/company/credits/branch-requests/count")).body.count).toBe(1);

    const response = await hq.post(`/api/company/credits/branch-requests/${id}/approve`);
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Request approved.");
    const row = await requestRow(id);
    expect(row).toMatchObject({ status: "PENDING", requested_by: hqId, company_reviewed_by: hqId });
    expect(row.company_reviewed_at).not.toBeNull();
    expect(await notificationsOf(adminId, "CREDIT_REQUEST_CREATED")).toMatchObject([{ credit_request_id: id }]);
    expect(await notificationsOf(branchId, "CREDIT_TOPUP_COMPANY_APPROVED")).toMatchObject([{ credit_request_id: id }]);
    expect((await hq.get("/api/company/credits/branch-requests/count")).body.count).toBe(0);

    // The admin sees it with the company and the headquarters as the sender.
    const adminList = await admin.get(`/api/admin/credits/requests?user_id=${branchId}`);
    expect(adminList.body.requests).toMatchObject([
      {
        id,
        status: "PENDING",
        company_name: COMPANY,
        user_business_name: "Cocredits Centar",
        requested_by_email: HQ,
        requested_by_role: "COMPANY",
      },
    ]);
    // The admin's notification names the company.
    const notes = await admin.get("/api/notifications");
    expect(notes.body.notifications[0]).toMatchObject({ credit_company: COMPANY, credit_requester: "Cocredits Centar" });

    // A second decision is refused.
    const twice = await hq.post(`/api/company/credits/branch-requests/${id}/reject`);
    expect(twice.status).toBe(400);
    expect(twice.body.error).toBe("Only requests waiting for your company can be approved or rejected.");
  });

  it("rejects it with a note the branch sees; the admin never does", async () => {
    const id = (await topup(branch)).body.request.id;
    const response = await hq.post(`/api/company/credits/branch-requests/${id}/reject`).send({ note: "  Not this month.  " });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Request rejected.");
    expect(await requestRow(id)).toMatchObject({ status: "COMPANY_REJECTED", company_note: "Not this month." });
    expect(await notificationsOf(branchId, "CREDIT_TOPUP_COMPANY_REJECTED")).toMatchObject([
      { credit_request_id: id, details: "Not this month." },
    ]);
    const mine = await branch.get("/api/credits/requests");
    expect(mine.body.requests).toMatchObject([{ id, status: "COMPANY_REJECTED", company_note: "Not this month." }]);
    expect((await admin.get(`/api/admin/credits/requests?user_id=${branchId}`)).body.requests).toEqual([]);
    expect(await notificationsOf(adminId)).toEqual([]);
    // The branch may ask again.
    expect((await topup(branch)).status).toBe(201);
  });

  it("validates the note and answers 404 for another company's request", async () => {
    const id = (await topup(branch)).body.request.id;
    const long = await hq.post(`/api/company/credits/branch-requests/${id}/reject`).send({ note: "x".repeat(501) });
    expect(long.status).toBe(400);
    expect(long.body.error).toBe("The note can be at most 500 characters long.");
    for (const action of ["approve", "reject"]) {
      const foreign = await otherHq.post(`/api/company/credits/branch-requests/${id}/${action}`);
      expect(foreign.status).toBe(404);
      expect(foreign.body.error).toBe("Request not found.");
    }
    expect((await otherHq.get("/api/company/credits/branch-requests")).body.requests).toEqual([]);
    expect((await hq.post("/api/company/credits/branch-requests/999999/approve")).status).toBe(404);
  });
});

describe("the headquarters asking for its branches", () => {
  it("asks for a plan for this or next month, with auto-renew", async () => {
    const current = await branchRequest(hq, secondId, { request_type: "SUBSCRIPTION", plan_id: planId, period: "current" });
    expect(current.status).toBe(201);
    expect(current.body.message).toBe("Request sent.");
    expect(current.body.request).toMatchObject({
      user_id: secondId,
      status: "PENDING",
      source: "COMPANY",
      requested_by: hqId,
      period_month: CURRENT,
    });
    noAdminNote(current.body);
    const next = await branchRequest(hq, branchId, {
      request_type: "SUBSCRIPTION",
      plan_id: planId,
      period: "next",
      auto_renew: true,
    });
    expect(next.body.request).toMatchObject({ period_month: nextMonth(CURRENT), auto_renew: true, requested_by: hqId });
    expect(await notificationsOf(adminId, "CREDIT_REQUEST_CREATED")).toHaveLength(2);
    // Same rules and messages as the user's own requests.
    const twice = await branchRequest(hq, secondId, { request_type: "SUBSCRIPTION", plan_id: planId, period: "current" });
    expect(twice.body.error).toBe("You already have a pending subscription request for this month.");
    const existing = await branchRequest(hq, branchId, { request_type: "SUBSCRIPTION", plan_id: planId, period: "current" });
    expect(existing.body.error).toBe("You already have a subscription for this month.");
    const badPeriod = await branchRequest(hq, branchId, { request_type: "SUBSCRIPTION", plan_id: planId, period: "later" });
    expect(badPeriod.body.error).toBe("Period is not valid.");
    const noTopup = await branchRequest(hq, secondId, { request_type: "TOPUP", topup_package_id: topupId });
    expect(noTopup.body.error).toBe("An active subscription for the current month is required to buy extra credits.");
  });

  it("asks for a top-up and withdraws it", async () => {
    const response = await branchRequest(hq, branchId, { request_type: "TOPUP", topup_package_id: topupId });
    expect(response.status).toBe(201);
    expect(response.body.request).toMatchObject({ status: "PENDING", source: "COMPANY", requested_by: hqId });
    const id = response.body.request.id;
    const withdrawn = await hq.delete(`/api/company/branches/${branchId}/credits/requests/${id}`);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.request.status).toBe("CANCELLED");
    const again = await hq.delete(`/api/company/branches/${branchId}/credits/requests/${id}`);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("Only pending requests can be withdrawn.");
    // Another branch's request is not found through this branch.
    const foreign = await hq.delete(`/api/company/branches/${secondId}/credits/requests/${id}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toBe("Request not found.");
  });

  it("turns a branch's auto-renew on and off", async () => {
    const on = await hq.patch(`/api/company/branches/${branchId}/credits/auto-renew`).send({ auto_renew: true });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ message: "Auto-renew turned on.", autoRenew: true });
    const row = await pool.query("SELECT auto_renew FROM subscriptions WHERE user_id = $1", [branchId]);
    expect(row.rows[0].auto_renew).toBe(true);
    const none = await hq.patch(`/api/company/branches/${secondId}/credits/auto-renew`).send({ auto_renew: true });
    expect(none.status).toBe(404);
    expect(none.body.error).toBe("The branch does not have an active subscription.");
    const bad = await hq.patch(`/api/company/branches/${branchId}/credits/auto-renew`).send({ auto_renew: "yes" });
    expect(bad.body.error).toBe("Auto-renew must be true or false.");
  });

  it("answers 404 for another company's branch on every route", async () => {
    const routes = [
      otherHq.get(`/api/company/branches/${branchId}/credits`),
      otherHq.post(`/api/company/branches/${branchId}/credits/requests`).send({ request_type: "TOPUP", topup_package_id: topupId }),
      otherHq.delete(`/api/company/branches/${branchId}/credits/requests/1`),
      otherHq.patch(`/api/company/branches/${branchId}/credits/auto-renew`).send({ auto_renew: true }),
      hq.get(`/api/company/branches/${otherBranchId}/credits`),
    ];
    for (const response of await Promise.all(routes)) {
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Branch not found.");
    }
  });

  it("refuses requests for a deactivated branch", async () => {
    await pool.query("UPDATE users SET deactivated_at = NOW() WHERE id = $1", [branchId]);
    const response = await branchRequest(hq, branchId, { request_type: "TOPUP", topup_package_id: topupId });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("The branch is deactivated.");
  });

  it("lists the plans and packages for the headquarters' dialogs", async () => {
    const plans = await hq.get("/api/company/credits/plans");
    expect(plans.body.plans.map((plan: { credits_per_period: number }) => plan.credits_per_period)).toEqual([20, 50, 150]);
    const packages = await hq.get("/api/company/credits/topup-packages");
    expect(packages.body.packages.map((topup: { credits: number }) => topup.credits)).toEqual([10, 20, 50]);
  });

  it("is only for the headquarters", async () => {
    expect((await branch.get("/api/company/credits")).status).toBe(403);
    expect((await admin.get("/api/company/credits/branch-requests")).status).toBe(403);
  });
});

describe("the headquarters' overview", () => {
  it("shows each branch's balance equal to getBalance, next month's plan and the company totals", async () => {
    await pool.query("UPDATE subscriptions SET auto_renew = true WHERE user_id = $1", [branchId]);
    await giveSubscription(branchId, 50, new Date(`${nextMonth(CURRENT)}T12:00:00Z`));
    const open = (await topup(branch)).body.request.id;

    const response = await hq.get("/api/company/credits");
    expect(response.status).toBe(200);
    expect(response.body.periodStart).toBe(CURRENT);
    expect(response.body.branches.map((row: { business_name: string }) => row.business_name)).toEqual([
      "Cocredits Breza",
      "Cocredits Centar",
    ]);
    const centar = response.body.branches[1];
    const balance = await getBalance(pool, branchId);
    expect(centar).toMatchObject({
      plan_name: "Pro",
      has_subscription: true,
      auto_renew: true,
      total: balance.total,
      used: balance.used,
      available: balance.available,
      next_plan_name: "Pro",
      status: "active",
      open_requests: [{ id: open, status: "COMPANY_REVIEW" }],
    });
    expect(response.body.branches[0]).toMatchObject({ has_subscription: false, plan_name: null, total: 0 });
    expect(response.body.totals).toEqual({ total: 10, used: 0, available: 10, branches: 2, withPlan: 1 });
    noAdminNote(response.body);
  });

  it("shows one branch's credits, history and requests as the branch sees them", async () => {
    await topup(branch);
    const response = await hq.get(`/api/company/branches/${branchId}/credits`);
    expect(response.status).toBe(200);
    const own = await branch.get("/api/credits/me");
    expect(response.body.credits).toEqual(own.body.credits);
    expect(response.body.history.months).toHaveLength(12);
    expect(response.body.total).toBe(1);
    expect(response.body.requests[0]).not.toHaveProperty("admin_note");
    expect((await hq.get(`/api/company/branches/${branchId}/credits?year=1`)).status).toBe(400);
  });

  it("lists the requests across branches with filters", async () => {
    await topup(branch);
    await branchRequest(hq, secondId, { request_type: "SUBSCRIPTION", plan_id: planId, period: "current" });
    const all = await hq.get("/api/company/credits/requests");
    expect(all.body.total).toBe(2);
    expect(all.body.requests.map((row: { branch_name: string }) => row.branch_name).sort()).toEqual([
      "Cocredits Breza",
      "Cocredits Centar",
    ]);
    const one = await hq.get(`/api/company/credits/requests?branch_id=${secondId}&type=SUBSCRIPTION&status=PENDING`);
    expect(one.body.total).toBe(1);
    expect((await hq.get("/api/company/credits/requests?status=NOPE")).status).toBe(400);
    expect((await otherHq.get("/api/company/credits/requests")).body.total).toBe(0);
  });
});

describe("the admin deciding a branch's request", () => {
  it("grants the credits to the branch and tells the branch and the headquarters, never the note", async () => {
    const id = (await topup(branch)).body.request.id;
    await hq.post(`/api/company/credits/branch-requests/${id}/approve`);
    const approved = await admin.post(`/api/admin/credits/requests/${id}/approve`).send({ note: "Paid by invoice 7" });
    expect(approved.status).toBe(200);
    expect((await getBalance(pool, branchId)).available).toBe(30);
    expect(await notificationsOf(branchId, "CREDIT_REQUEST_APPROVED")).toMatchObject([{ credit_request_id: id }]);
    expect(await notificationsOf(hqId, "BRANCH_CREDIT_REQUEST_APPROVED")).toMatchObject([
      { credit_request_id: id, branch_id: branchId, details: null },
    ]);

    const plan = await branchRequest(hq, secondId, { request_type: "SUBSCRIPTION", plan_id: planId, period: "current" });
    await admin.post(`/api/admin/credits/requests/${plan.body.request.id}/reject`).send({ note: "Unpaid" });
    expect(await notificationsOf(hqId, "BRANCH_CREDIT_REQUEST_REJECTED")).toHaveLength(1);
    expect(await notificationsOf(secondId, "CREDIT_REQUEST_REJECTED")).toHaveLength(1);

    for (const response of [
      await branch.get("/api/credits/requests"),
      await hq.get("/api/company/credits/requests"),
      await hq.get(`/api/company/branches/${branchId}/credits`),
      await hq.get("/api/notifications"),
      await branch.get("/api/notifications"),
    ]) {
      noAdminNote(response.body);
      expect(JSON.stringify(response.body)).not.toContain("invoice 7");
      expect(JSON.stringify(response.body)).not.toContain("Unpaid");
    }
  });

  it("shows the company in the overview", async () => {
    const response = await admin.get("/api/admin/credits/overview?q=Cocredits Centar");
    expect(response.body.users).toMatchObject([{ id: branchId, company_name: COMPANY }]);
  });
});

describe("deactivating a branch", () => {
  it("withdraws its open requests and turns auto-renew off; reactivation keeps it off", async () => {
    await pool.query("UPDATE subscriptions SET auto_renew = true WHERE user_id = $1", [branchId]);
    const next = await giveSubscription(branchId, 10, new Date(`${nextMonth(CURRENT)}T12:00:00Z`));
    await pool.query("UPDATE subscriptions SET auto_renew = true WHERE id = $1", [next]);
    const waiting = (await topup(branch)).body.request.id;
    // A pending plan request at the admin (the month after next, as next month already has a plan).
    const pending = await pool.query<{ id: number }>(
      `INSERT INTO credit_requests (user_id, request_type, plan_id, period_month, source, requested_by)
       VALUES ($1, 'SUBSCRIPTION', $2, $3, 'COMPANY', $4) RETURNING id`,
      [branchId, planId, nextMonth(nextMonth(CURRENT)), hqId],
    );

    const response = await hq.post(`/api/company/branches/${branchId}/deactivate`);
    expect(response.status).toBe(200);
    expect(response.body.withdrawnRequests).toBe(2);
    expect((await requestRow(waiting)).status).toBe("CANCELLED");
    expect((await requestRow(pending.rows[0]!.id)).status).toBe("CANCELLED");
    const subscriptions = await pool.query("SELECT auto_renew FROM subscriptions WHERE user_id = $1", [branchId]);
    expect(subscriptions.rows.map((row) => row.auto_renew)).toEqual([false, false]);

    await hq.post(`/api/company/branches/${branchId}/reactivate`);
    const after = await pool.query("SELECT auto_renew FROM subscriptions WHERE user_id = $1", [branchId]);
    expect(after.rows.map((row) => row.auto_renew)).toEqual([false, false]);
  });

  it("does the same when an admin deactivates it", async () => {
    const waiting = (await topup(branch)).body.request.id;
    const response = await admin.post(`/api/admin/companies/${companyId}/branches/${branchId}/deactivate`);
    expect(response.status).toBe(200);
    expect(response.body.withdrawnRequests).toBe(1);
    expect((await requestRow(waiting)).status).toBe("CANCELLED");
  });
});

describe("the renewal job", () => {
  const JUNE_29 = new Date("2030-06-29T12:00:00Z");
  const renewals = async (id: number) =>
    (await pool.query("SELECT * FROM credit_requests WHERE user_id = $1 AND source = 'AUTO_RENEW'", [id])).rows;

  beforeEach(async () => {
    for (const id of [branchId, secondId, otherBranchId]) {
      const subscription = await giveSubscription(id, 10, new Date("2030-06-28T12:00:00Z"));
      await pool.query("UPDATE subscriptions SET auto_renew = true WHERE id = $1", [subscription]);
    }
  });

  it("renews branches like other stores, with no sender, and skips deactivated and blocked ones", async () => {
    await pool.query("UPDATE users SET deactivated_at = NOW() WHERE id = $1", [secondId]);
    await pool.query("UPDATE users SET is_blocked = true WHERE id = $1", [otherBranchId]);
    await runCreditRenewals(JUNE_29);
    expect(await renewals(branchId)).toMatchObject([{ status: "PENDING", requested_by: null, period_month: "2030-07-01" }]);
    expect(await renewals(secondId)).toEqual([]);
    expect(await renewals(otherBranchId)).toEqual([]);
  });

  it("skips the branches of a blocked company", async () => {
    await pool.query("UPDATE companies SET is_blocked = true WHERE id = $1", [companyId]);
    await runCreditRenewals(JUNE_29);
    expect(await renewals(branchId)).toEqual([]);
    expect(await renewals(secondId)).toEqual([]);
    expect(await renewals(otherBranchId)).toHaveLength(1);
  });

  it("expires a top-up still waiting for the headquarters and tells the branch and the headquarters", async () => {
    const id = (await topup(branch)).body.request.id;
    await pool.query("UPDATE credit_requests SET period_month = '2000-01-01' WHERE id = $1", [id]);
    await runCreditRenewals();
    expect((await requestRow(id)).status).toBe("EXPIRED");
    expect(await notificationsOf(branchId, "CREDIT_REQUEST_EXPIRED")).toHaveLength(1);
    expect(await notificationsOf(hqId, "BRANCH_CREDIT_REQUEST_EXPIRED")).toMatchObject([{ branch_id: branchId }]);
  });
});

describe("stores without a company and restaurants", () => {
  it("keep sending their own requests to the admin", async () => {
    await insertUser(LONE_STORE, "STORE", "Cocredits Lone", 10);
    await insertUser(RESTAURANT, "RESTAURANT", "Cocredits Restaurant", 10);
    for (const email of [LONE_STORE, RESTAURANT]) {
      const agent = await login(email);
      const id = await userId(email);
      const me = await agent.get("/api/credits/me");
      expect(me.body.credits).toMatchObject({ managedByCompany: false, companyName: null });
      const plan = await agent
        .post("/api/credits/requests")
        .send({ request_type: "SUBSCRIPTION", plan_id: planId, period: "next", auto_renew: true });
      expect(plan.status).toBe(201);
      expect(plan.body.message).toBe("Request sent.");
      expect(plan.body.request).toMatchObject({ status: "PENDING", source: "USER", requested_by: id });
      const added = await topup(agent);
      expect(added.body.request).toMatchObject({ status: "PENDING", requested_by: id });
      expect((await agent.patch("/api/credits/subscription/auto-renew").send({ auto_renew: true })).status).toBe(200);
      expect((await agent.delete(`/api/credits/requests/${added.body.request.id}`)).status).toBe(200);
      const list = await admin.get(`/api/admin/credits/requests?user_id=${id}`);
      expect(list.body.requests[0]).toMatchObject({ company_name: null, requested_by_email: email });
    }
  });
});
