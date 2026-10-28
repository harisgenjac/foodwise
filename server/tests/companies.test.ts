import fs from "fs";
import path from "path";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import {
  type Agent,
  cleanupCompanies,
  cleanupUsers,
  createProduct,
  futurePickup,
  insertCompany,
  insertUser,
  login,
  registerAndLogin,
  reserve,
  userId,
} from "./helpers.js";

const ADMIN = "companies-admin@test.com";
const HQ = "companies-hq@test.com";
const NEW_HQ = "companies-new-hq@test.com";
const BRANCH = "companies-branch@test.com";
const OTHER_STORE = "companies-other-store@test.com";
const RESTAURANT = "companies-restaurant@test.com";
const EMAILS = [ADMIN, HQ, NEW_HQ, BRANCH, OTHER_STORE, RESTAURANT];

const COMPANY = "Companies Test Chain";
const NEW_COMPANY = "Companies New Chain";
const OTHER_COMPANY = "Companies Other Chain";
const COMPANIES = [COMPANY, NEW_COMPANY, OTHER_COMPANY];

// A minimal PNG signature is enough: the server checks the declared type, not the pixels.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let admin: Agent;
let restaurant: Agent;
let companyId: number;

const reservationStatus = async (id: number) =>
  (await pool.query("SELECT status FROM reservations WHERE id = $1", [id])).rows[0].status;

const notificationsOf = async (email: string) =>
  (
    await pool.query(
      `SELECT notifications.type, notifications.reservation_id, notifications.details
       FROM notifications JOIN users ON notifications.user_id = users.id
       WHERE users.email = $1 ORDER BY notifications.id`,
      [email],
    )
  ).rows;

const companyActions = async (id: number) =>
  (
    await pool.query(
      "SELECT admin_actions.action, admin_actions.reason FROM admin_actions WHERE admin_actions.target_company_id = $1 ORDER BY admin_actions.id",
      [id],
    )
  ).rows;

describe("Companies", () => {
  beforeEach(async () => {
    admin = await registerAndLogin(ADMIN, "ADMIN");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    companyId = await insertCompany(COMPANY);
    await insertUser(HQ, "COMPANY", null, null, companyId);
  });

  afterEach(async () => {
    await cleanupUsers(EMAILS);
    await cleanupCompanies(COMPANIES);
  });

  describe("creation", () => {
    it("creates the company and its headquarters login in one go", async () => {
      const response = await admin
        .post("/api/admin/companies")
        .send({ name: `  ${NEW_COMPANY} `, email: " Companies-New-HQ@test.com ", password: "lozinka123" });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Company created successfully.");
      expect(response.body.company).toMatchObject({ name: NEW_COMPANY, is_blocked: false, branch_count: 0 });
      expect(response.body.user).toMatchObject({
        email: NEW_HQ,
        role: "COMPANY",
        company_id: response.body.company.id,
        must_change_password: true,
      });
      expect(await companyActions(response.body.company.id)).toEqual([
        expect.objectContaining({ action: "CREATE_COMPANY" }),
      ]);

      // The temporary password works, and the login must change it first.
      const hq = await login(NEW_HQ, "lozinka123");
      expect((await hq.get("/api/company/me")).status).toBe(403);
      expect((await hq.get("/api/users/me")).body.user).toMatchObject({
        role: "COMPANY",
        company_name: NEW_COMPANY,
        must_change_password: true,
      });
    });

    it("validates the fields and keeps nothing when the email is taken", async () => {
      const missing = await admin.post("/api/admin/companies").send({ name: NEW_COMPANY, email: NEW_HQ });
      expect(missing.status).toBe(400);
      expect(missing.body.error).toBe("Company name, email and password are required.");

      const blankName = await admin
        .post("/api/admin/companies")
        .send({ name: "   ", email: NEW_HQ, password: "lozinka123" });
      expect(blankName.body.error).toBe("Company name is required.");

      const longName = await admin
        .post("/api/admin/companies")
        .send({ name: "x".repeat(121), email: NEW_HQ, password: "lozinka123" });
      expect(longName.body.error).toBe("Company name can be at most 120 characters long.");

      const badEmail = await admin
        .post("/api/admin/companies")
        .send({ name: NEW_COMPANY, email: "nope", password: "lozinka123" });
      expect(badEmail.body.error).toBe("Email is not valid.");

      const shortPassword = await admin
        .post("/api/admin/companies")
        .send({ name: NEW_COMPANY, email: NEW_HQ, password: "short" });
      expect(shortPassword.body.error).toBe("Password must be at least 8 characters long.");

      const duplicateName = await admin
        .post("/api/admin/companies")
        .send({ name: COMPANY.toUpperCase(), email: NEW_HQ, password: "lozinka123" });
      expect(duplicateName.status).toBe(400);
      expect(duplicateName.body.error).toBe("A company with this name already exists.");

      const duplicateEmail = await admin
        .post("/api/admin/companies")
        .send({ name: NEW_COMPANY, email: HQ.toUpperCase(), password: "lozinka123" });
      expect(duplicateEmail.status).toBe(400);
      expect(duplicateEmail.body.error).toBe("A user with this email already exists.");
      // The transaction rolled the company back with the user.
      const left = await pool.query("SELECT id FROM companies WHERE name = $1", [NEW_COMPANY]);
      expect(left.rows).toEqual([]);
    });

    it("refuses company accounts on POST /users", async () => {
      const response = await admin
        .post("/api/admin/users")
        .send({ role: "COMPANY", email: NEW_HQ, password: "lozinka123" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Company accounts are created on the Companies page.");
    });

    it("keeps company_id consistent with the role (CHECK)", async () => {
      const insert = (role: string, company: number | null) =>
        pool.query(
          "INSERT INTO users (email, password_hash, role, company_id) VALUES ($1, 'x', $2, $3)",
          [NEW_HQ, role, company],
        );
      await expect(insert("COMPANY", null)).rejects.toMatchObject({ constraint: "users_company_matches_role" });
      await expect(insert("RESTAURANT", companyId)).rejects.toMatchObject({ constraint: "users_company_matches_role" });
      await expect(insert("ADMIN", companyId)).rejects.toMatchObject({ constraint: "users_company_matches_role" });
      // A store may belong to a company (a branch) or not.
      await expect(insert("STORE", companyId)).resolves.toBeDefined();
    });
  });

  describe("admin list, details and edit", () => {
    it("lists companies with the HQ email and branch count, filtered by name, email and block", async () => {
      await insertUser(BRANCH, "STORE", "Branch", null, companyId);
      const list = await admin.get("/api/admin/companies?q=companies-hq");
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(1);
      expect(list.body.companies[0]).toMatchObject({
        id: companyId,
        name: COMPANY,
        hq_email: HQ,
        branch_count: 1,
        is_blocked: false,
      });
      expect((await admin.get(`/api/admin/companies?q=${encodeURIComponent("test chain")}`)).body.total).toBe(1);
      expect((await admin.get("/api/admin/companies?q=companies&blocked=true")).body.total).toBe(0);
      expect((await admin.get("/api/admin/companies?q=companies&blocked=false")).body.total).toBe(1);
      expect((await admin.get("/api/admin/companies?blocked=maybe")).status).toBe(400);
      expect((await admin.get("/api/admin/companies?limit=0")).status).toBe(400);
    });

    it("shows the details and updates the name and description", async () => {
      const update = await admin
        .put(`/api/admin/companies/${companyId}`)
        .send({ name: OTHER_COMPANY, description: "Lanac prodavnica" });
      expect(update.status).toBe(200);
      expect(update.body.message).toBe("Company updated.");
      expect(update.body.company).toMatchObject({ name: OTHER_COMPANY, description: "Lanac prodavnica" });

      const details = await admin.get(`/api/admin/companies/${companyId}`);
      expect(details.status).toBe(200);
      expect(details.body.company).toMatchObject({ name: OTHER_COMPANY, branch_count: 0 });
      expect(details.body.hqUsers).toEqual([expect.objectContaining({ email: HQ })]);
      expect(details.body.branches).toEqual([]);
      expect(details.body.actions).toEqual([
        expect.objectContaining({ action: "UPDATE_COMPANY", admin_email: ADMIN }),
      ]);

      expect((await admin.put(`/api/admin/companies/${companyId}`).send({ name: "" })).body.error).toBe(
        "Company name is required.",
      );
      expect((await admin.get("/api/admin/companies/999999")).status).toBe(404);
      expect((await admin.put("/api/admin/companies/999999").send({ name: "X" })).status).toBe(404);
    });

    it("refuses a name another company already uses", async () => {
      await insertCompany(NEW_COMPANY);
      const response = await admin
        .put(`/api/admin/companies/${companyId}`)
        .send({ name: NEW_COMPANY.toLowerCase() });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("A company with this name already exists.");
    });

    it("lists company users with their company name and filters them by role", async () => {
      const response = await admin.get("/api/admin/users?role=COMPANY&q=companies-");
      expect(response.status).toBe(200);
      expect(response.body.users).toEqual([
        expect.objectContaining({ email: HQ, role: "COMPANY", company_id: companyId, company_name: COMPANY }),
      ]);
    });
  });

  describe("blocking a company", () => {
    it("blocks every user of the company at login and in a running session", async () => {
      const hq = await login(HQ);
      const response = await admin.post(`/api/admin/companies/${companyId}/block`).send({ reason: "Neplaćeno" });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Company blocked.");
      expect(response.body.company).toMatchObject({ is_blocked: true, blocked_reason: "Neplaćeno" });

      const session = await hq.get("/api/users/me");
      expect(session.status).toBe(401);
      expect(session.body.error).toBe("Your account is blocked.");
      const attempt = await request(app).post("/api/auth/login").send({ email: HQ, password: "test12345" });
      expect(attempt.status).toBe(403);
      expect(attempt.body.error).toBe("Your account is blocked. Reason: Neplaćeno");
      // The user's own flag is untouched.
      const own = await pool.query("SELECT is_blocked FROM users WHERE email = $1", [HQ]);
      expect(own.rows[0].is_blocked).toBe(false);

      expect(await companyActions(companyId)).toEqual([
        expect.objectContaining({ action: "BLOCK_COMPANY", reason: "Neplaćeno" }),
      ]);
      const blockedUsers = await admin.get("/api/admin/users?blocked=true&q=companies-hq");
      expect(blockedUsers.body.users).toEqual([expect.objectContaining({ email: HQ, company_is_blocked: true })]);
    });

    it("hides the company's stores, cancels their Pending reservations and keeps Confirmed ones", async () => {
      await insertUser(BRANCH, "STORE", "Companies Branch", 1000, companyId);
      const branch = await login(BRANCH);
      const product = await createProduct(branch, { quantity: 10 });
      const pending = await reserve(restaurant, product.id, 2);
      const confirmed = await reserve(restaurant, product.id, 3);
      await branch.patch(`/api/reservations/${confirmed}/accept`);
      await restaurant.post("/api/favorites").send({ store_id: product.store_id });

      const response = await admin.post(`/api/admin/companies/${companyId}/block`).send({ reason: "Kršenje" });
      expect(response.body.cancelledReservations).toBe(1);
      expect(await reservationStatus(pending)).toBe("Cancelled");
      expect(await reservationStatus(confirmed)).toBe("Confirmed");
      // The restaurant is told without the reason, and gets its credit back.
      expect(await notificationsOf(RESTAURANT)).toContainEqual(
        expect.objectContaining({ type: "RESERVATION_CANCELLED_BY_ADMIN", reservation_id: pending, details: null }),
      );
      const refund = await pool.query(
        `SELECT 1 FROM credit_transactions
         WHERE type = 'RESERVATION_REFUND' AND related_entity_type = 'reservation' AND related_entity_id = $1`,
        [pending],
      );
      expect(refund.rows).toHaveLength(1);

      const products = await restaurant.get("/api/products?radius=all");
      expect(products.body.products.some((row: { id: number }) => row.id === product.id)).toBe(false);
      expect((await restaurant.get(`/api/products/${product.id}`)).status).toBe(404);
      expect((await restaurant.get(`/api/users/stores/${product.store_id}`)).status).toBe(404);
      const stores = await restaurant.get("/api/users/stores?radius=all");
      expect(stores.body.stores.some((row: { id: number }) => row.id === product.store_id)).toBe(false);
      expect((await restaurant.get("/api/favorites")).body.favorites).toEqual([]);
      await restaurant.delete(`/api/favorites/${product.store_id}`);
      expect((await restaurant.post("/api/favorites").send({ store_id: product.store_id })).status).toBe(404);
      const reservation = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 1, pickup_date: futurePickup(1) });
      expect(reservation.status).toBe(404);

      // Unblocking brings the store back.
      const unblock = await admin.post(`/api/admin/companies/${companyId}/unblock`);
      expect(unblock.status).toBe(200);
      expect(unblock.body.message).toBe("Company unblocked.");
      expect((await restaurant.get(`/api/products/${product.id}`)).status).toBe(200);
      await expect(login(BRANCH)).resolves.toBeDefined();
    });

    it("leaves a store an admin blocked on its own blocked after the company is unblocked", async () => {
      await insertUser(BRANCH, "STORE", "Companies Branch", 1000, companyId);
      const branchId = await userId(BRANCH);
      await admin.post(`/api/admin/users/${branchId}/block`).send({ reason: "Sama poslovnica" });
      await admin.post(`/api/admin/companies/${companyId}/block`).send({ reason: "Firma" });
      await admin.post(`/api/admin/companies/${companyId}/unblock`);

      const attempt = await request(app).post("/api/auth/login").send({ email: BRANCH, password: "test12345" });
      expect(attempt.status).toBe(403);
      expect(attempt.body.error).toBe("Your account is blocked. Reason: Sama poslovnica");
      await expect(login(HQ)).resolves.toBeDefined();
      expect((await companyActions(companyId)).map((row) => row.action)).toEqual([
        "BLOCK_COMPANY",
        "UNBLOCK_COMPANY",
      ]);
    });

    it("does not affect stores of other companies or without a company", async () => {
      await insertUser(OTHER_STORE, "STORE", "Companies Other Store");
      const other = await login(OTHER_STORE);
      const product = await createProduct(other);
      await admin.post(`/api/admin/companies/${companyId}/block`).send({ reason: "Firma" });
      expect((await restaurant.get(`/api/products/${product.id}`)).status).toBe(200);
    });

    it("validates the reason and the state", async () => {
      const noReason = await admin.post(`/api/admin/companies/${companyId}/block`).send({});
      expect(noReason.status).toBe(400);
      expect(noReason.body.error).toBe("A reason is required (at most 500 characters).");
      const notBlocked = await admin.post(`/api/admin/companies/${companyId}/unblock`);
      expect(notBlocked.body.error).toBe("Company is not blocked.");
      await admin.post(`/api/admin/companies/${companyId}/block`).send({ reason: "Prvi" });
      const again = await admin.post(`/api/admin/companies/${companyId}/block`).send({ reason: "Drugi" });
      expect(again.body.error).toBe("Company is already blocked.");
      expect((await admin.post("/api/admin/companies/999999/block").send({ reason: "X" })).status).toBe(404);
      expect((await admin.post("/api/admin/companies/999999/unblock")).status).toBe(404);
    });

    it("filters the audit log by the company actions and names the company", async () => {
      await admin.post(`/api/admin/companies/${companyId}/block`).send({ reason: "Firma" });
      const log = await admin.get(`/api/admin/actions?action=BLOCK_COMPANY&admin_id=${await userId(ADMIN)}`);
      expect(log.status).toBe(200);
      expect(log.body.actions).toEqual([
        expect.objectContaining({ action: "BLOCK_COMPANY", target_company_id: companyId, company_name: COMPANY }),
      ]);
    });
  });

  describe("headquarters (COMPANY role)", () => {
    let hq: Agent;
    beforeEach(async () => {
      hq = await login(HQ);
    });

    it("is rejected on store, restaurant, admin and credit endpoints", async () => {
      const calls: [string, () => request.Test][] = [
        ["POST /products", () => hq.post("/api/products").send({})],
        ["GET /products", () => hq.get("/api/products")],
        ["GET /products/mine", () => hq.get("/api/products/mine")],
        ["POST /reservations", () => hq.post("/api/reservations").send({})],
        ["GET /reservations/store", () => hq.get("/api/reservations/store")],
        ["GET /reservations/pickups", () => hq.get("/api/reservations/pickups?scope=today")],
        ["GET /users/stores", () => hq.get("/api/users/stores")],
        ["POST /users/me/logo", () => hq.post("/api/users/me/logo")],
        ["GET /favorites", () => hq.get("/api/favorites")],
        ["GET /donations/mine", () => hq.get("/api/donations/mine")],
        ["GET /product-templates", () => hq.get("/api/product-templates")],
        ["GET /reports/sales", () => hq.get("/api/reports/sales")],
        ["GET /dashboard/stats", () => hq.get("/api/dashboard/stats")],
        ["GET /admin/users", () => hq.get("/api/admin/users")],
        ["GET /admin/companies", () => hq.get("/api/admin/companies")],
        ["GET /credits/me", () => hq.get("/api/credits/me")],
        ["POST /credits/requests", () => hq.post("/api/credits/requests").send({})],
      ];
      for (const [name, call] of calls) {
        const response = await call();
        expect({ name, status: response.status }).toEqual({ name, status: 403 });
        expect(response.body.error).toBe("You do not have the required role for this action.");
      }
      // An admin cannot give a company login credits either.
      const adjust = await admin
        .post(`/api/admin/credits/users/${await userId(HQ)}/adjust`)
        .send({ amount: 5, reason: "Test" });
      expect(adjust.body.error).toBe("Credits apply only to stores and restaurants.");
    });

    it("updates its own profile with first name, last name and phone", async () => {
      const missing = await hq.put("/api/users/me").send({ first_name: "Amra", last_name: "Hodžić" });
      expect(missing.status).toBe(400);
      expect(missing.body.error).toBe("First name, last name and phone are required.");

      const response = await hq
        .put("/api/users/me")
        .send({ first_name: "Amra", last_name: "Hodžić", phone: "061 111 222", business_name: "Ignored" });
      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({ first_name: "Amra", last_name: "Hodžić", phone: "061 111 222" });
      const me = await hq.get("/api/users/me");
      expect(me.body.user).toMatchObject({ business_name: null, company_id: companyId, company_name: COMPANY });

      const password = await hq
        .put("/api/users/me/password")
        .send({ current_password: "test12345", new_password: "novalozinka1" });
      expect(password.status).toBe(200);
      expect((await hq.get("/api/notifications")).status).toBe(200);
      expect((await hq.get("/api/stats/impact")).status).toBe(200);
    });

    it("reads and edits its company, but never its name", async () => {
      const company = await hq.get("/api/company/me");
      expect(company.status).toBe(200);
      expect(company.body.company).toMatchObject({ id: companyId, name: COMPANY, branch_count: 0 });

      const update = await hq.put("/api/company/me").send({ name: "Renamed", description: "  Naša firma  " });
      expect(update.status).toBe(200);
      expect(update.body.message).toBe("Company profile updated.");
      expect(update.body.company).toMatchObject({ name: COMPANY, description: "Naša firma" });

      const tooLong = await hq.put("/api/company/me").send({ description: "x".repeat(1001) });
      expect(tooLong.body.error).toBe("Description can be at most 1000 characters long.");

      // Other roles have no company endpoint.
      expect((await restaurant.get("/api/company/me")).status).toBe(403);
      expect((await admin.get("/api/company/me")).status).toBe(403);
    });

    it("uploads the company logo with the user logo rules", async () => {
      const wrongType = await hq
        .post("/api/company/me/logo")
        .attach("logo", Buffer.from("text"), { filename: "a.txt", contentType: "text/plain" });
      expect(wrongType.status).toBe(400);
      expect(wrongType.body.error).toBe("Only JPEG, PNG and WEBP images are allowed.");

      const first = await hq
        .post("/api/company/me/logo")
        .attach("logo", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
      expect(first.status).toBe(200);
      expect(first.body.logo_url).toMatch(/^\/uploads\/logos\/company-\d+-\d+\.png$/);
      const firstFile = path.join("uploads", "logos", path.basename(first.body.logo_url));
      expect(fs.existsSync(firstFile)).toBe(true);

      const second = await hq
        .post("/api/company/me/logo")
        .attach("logo", PNG_BYTES, { filename: "b.png", contentType: "image/png" });
      expect(second.status).toBe(200);
      // The replaced file is deleted.
      expect(fs.existsSync(firstFile)).toBe(false);
      expect((await hq.get("/api/company/me")).body.company.logo_url).toBe(second.body.logo_url);
      expect((await hq.get("/api/users/me")).body.user.company_logo_url).toBe(second.body.logo_url);
      await fs.promises.unlink(path.join("uploads", "logos", path.basename(second.body.logo_url)));
    });

    it("gets announcements for stores and everyone, not for restaurants", async () => {
      const send = (audience: string, title: string) =>
        admin.post("/api/admin/announcements").send({ audience, title_bs: title, body_bs: "Tekst" });
      const forStores = await send("STORE", "Companies za prodavnice");
      const forAll = await send("ALL", "Companies za sve");
      const forRestaurants = await send("RESTAURANT", "Companies za restorane");

      const active = await hq.get("/api/announcements/active");
      expect(active.status).toBe(200);
      const ids = active.body.announcements.map((row: { id: number }) => row.id);
      expect(ids).toContain(forStores.body.announcement.id);
      expect(ids).toContain(forAll.body.announcement.id);
      expect(ids).not.toContain(forRestaurants.body.announcement.id);
      expect(
        (await hq.post(`/api/announcements/${forStores.body.announcement.id}/dismiss`)).status,
      ).toBe(200);
      expect(
        (await hq.post(`/api/announcements/${forRestaurants.body.announcement.id}/dismiss`)).status,
      ).toBe(404);
      const types = (await notificationsOf(HQ)).map((row) => row.type);
      expect(types.filter((type) => type === "PLATFORM_ANNOUNCEMENT")).toHaveLength(2);
    });
  });
});
