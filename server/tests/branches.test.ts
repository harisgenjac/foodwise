import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import {
  type Agent,
  cityId,
  cleanupCompanies,
  cleanupUsers,
  createProduct,
  futurePickup,
  insertCompany,
  insertUser,
  login,
  PASSWORD,
  registerAndLogin,
  reserve,
  userId,
} from "./helpers.js";

const ADMIN = "branches-admin@test.com";
const HQ = "branches-hq@test.com";
const OTHER_HQ = "branches-other-hq@test.com";
const BRANCH = "branches-branch@test.com";
const NEW_BRANCH = "branches-new@test.com";
const OTHER_BRANCH = "branches-other-branch@test.com";
const LONE_STORE = "branches-lone-store@test.com";
const RESTAURANT = "branches-restaurant@test.com";
const EMAILS = [ADMIN, HQ, OTHER_HQ, BRANCH, NEW_BRANCH, OTHER_BRANCH, LONE_STORE, RESTAURANT];

const COMPANY = "Branches Test Chain";
const OTHER_COMPANY = "Branches Other Chain";

let admin: Agent;
let hq: Agent;
let restaurant: Agent;
let companyId: number;
let branchId: number;

const reservationStatus = async (id: number) =>
  (await pool.query("SELECT status FROM reservations WHERE id = $1", [id])).rows[0].status;

const notificationsOf = async (email: string) =>
  (
    await pool.query(
      `SELECT notifications.type, notifications.reservation_id, notifications.branch_id, notifications.details
       FROM notifications JOIN users ON notifications.user_id = users.id
       WHERE users.email = $1 ORDER BY notifications.id`,
      [email],
    )
  ).rows;

const branchPayload = (overrides: Record<string, unknown> = {}) => ({
  business_name: "Bingo Breza",
  city_id: undefined as unknown,
  address: "Titova 1",
  phone: "032 111 222",
  email: NEW_BRANCH,
  password: "lozinka123",
  ...overrides,
});

describe("Branches", () => {
  beforeEach(async () => {
    admin = await registerAndLogin(ADMIN, "ADMIN");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
    companyId = await insertCompany(COMPANY);
    await insertUser(HQ, "COMPANY", null, null, companyId);
    await insertUser(BRANCH, "STORE", "Branches Centar", 1000, companyId);
    branchId = await userId(BRANCH);
    // A branch always has a city (the headquarters sets it on creation).
    await pool.query("UPDATE users SET city_id = $1, address = 'Titova 1', phone = '032 000' WHERE id = $2", [
      await cityId("Vareš"),
      branchId,
    ]);
    hq = await login(HQ);
  });

  afterEach(async () => {
    await cleanupUsers(EMAILS);
    await cleanupCompanies([COMPANY, OTHER_COMPANY]);
  });

  describe("creating and editing", () => {
    it("creates a store of the company with a temporary password", async () => {
      const breza = await cityId("Breza");
      const response = await hq.post("/api/company/branches").send(branchPayload({ city_id: breza }));
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Branch created successfully.");
      expect(response.body.branch).toMatchObject({
        email: NEW_BRANCH,
        business_name: "Bingo Breza",
        city: "Breza",
        status: "active",
        must_change_password: true,
      });
      const row = await pool.query("SELECT role, company_id, first_name FROM users WHERE email = $1", [NEW_BRANCH]);
      expect(row.rows[0]).toEqual({ role: "STORE", company_id: companyId, first_name: null });

      // The staff log in with the temporary password; the profile gate asks for the names.
      const staff = await login(NEW_BRANCH, "lozinka123");
      const me = await staff.get("/api/users/me");
      expect(me.body.user).toMatchObject({ must_change_password: true, first_name: null, company_name: COMPANY });
    });

    it("validates the fields", async () => {
      const missing = await hq.post("/api/company/branches").send(branchPayload({ city_id: await cityId("Breza"), phone: "" }));
      expect(missing.status).toBe(400);
      expect(missing.body.error).toBe("Business name, city, address, phone, email and password are required.");
      const badCity = await hq.post("/api/company/branches").send(branchPayload({ city_id: 999999 }));
      expect(badCity.body.error).toBe("Invalid city.");
      const badEmail = await hq
        .post("/api/company/branches")
        .send(branchPayload({ city_id: await cityId("Breza"), email: "nope" }));
      expect(badEmail.body.error).toBe("Email is not valid.");
      const duplicate = await hq
        .post("/api/company/branches")
        .send(branchPayload({ city_id: await cityId("Breza"), email: BRANCH.toUpperCase() }));
      expect(duplicate.status).toBe(400);
      expect(duplicate.body.error).toBe("A user with this email already exists.");
    });

    it("lets the headquarters change the name, city, address and phone, but not the branch itself", async () => {
      const vares = await cityId("Vareš");
      const update = await hq
        .put(`/api/company/branches/${branchId}`)
        .send({ business_name: "Branches Vareš", city_id: vares, address: "Nova 2", phone: "032 999" });
      expect(update.status).toBe(200);
      expect(update.body.branch).toMatchObject({ business_name: "Branches Vareš", city: "Vareš", address: "Nova 2" });
      const invalid = await hq.put(`/api/company/branches/${branchId}`).send({ business_name: "X" });
      expect(invalid.body.error).toBe("Business name, city, address and phone are required.");

      // The branch's own profile save keeps the name and city (they are ignored), the rest changes.
      const branch = await login(BRANCH);
      const own = await branch.put("/api/users/me").send({
        first_name: "Ana",
        last_name: "Anić",
        business_name: "Renamed",
        city_id: await cityId("Olovo"),
        address: "Branchova 3",
        phone: "061 000",
      });
      expect(own.status).toBe(200);
      expect(own.body.user).toMatchObject({ business_name: "Branches Vareš", city: "Vareš", address: "Branchova 3" });

      // An admin can change them.
      const byAdmin = await admin.put(`/api/admin/users/${branchId}/profile`).send({
        first_name: "Ana",
        last_name: "Anić",
        business_name: "By Admin",
        city_id: await cityId("Olovo"),
        address: "Branchova 3",
        phone: "061 000",
      });
      expect(byAdmin.body.user).toMatchObject({ business_name: "By Admin", city: "Olovo" });
    });

    it("sets a new temporary password", async () => {
      const response = await hq.patch(`/api/company/branches/${branchId}/password`).send({ password: "novalozinka1" });
      expect(response.status).toBe(200);
      const staff = await login(BRANCH, "novalozinka1");
      expect((await staff.get("/api/users/me")).body.user.must_change_password).toBe(true);
      expect((await hq.patch(`/api/company/branches/${branchId}/password`).send({ password: "x" })).status).toBe(400);
    });
  });

  describe("access", () => {
    it("answers 404 for a branch of another company on every route", async () => {
      const otherCompany = await insertCompany(OTHER_COMPANY);
      await insertUser(OTHER_HQ, "COMPANY", null, null, otherCompany);
      const other = await login(OTHER_HQ);
      const calls = [
        other.get(`/api/company/branches/${branchId}`),
        other.put(`/api/company/branches/${branchId}`).send({}),
        other.get(`/api/company/branches/${branchId}/products`),
        other.get(`/api/company/branches/${branchId}/reservations`),
        other.patch(`/api/company/branches/${branchId}/password`).send({ password: "lozinka123" }),
        other.post(`/api/company/branches/${branchId}/deactivate`),
        other.post(`/api/company/branches/${branchId}/reactivate`),
        // A user that is not a branch at all looks the same.
        hq.get(`/api/company/branches/${await userId(RESTAURANT)}`),
        hq.get("/api/company/branches/999999"),
      ];
      for (const response of await Promise.all(calls)) {
        expect(response.status).toBe(404);
        expect(response.body.error).toBe("Branch not found.");
      }
      expect((await other.get("/api/company/branches")).body.branches).toEqual([]);
    });

    it("rejects every other role", async () => {
      const branch = await login(BRANCH);
      for (const agent of [admin, restaurant, branch]) {
        const list = await agent.get("/api/company/branches");
        expect(list.status).toBe(403);
        expect((await agent.post("/api/company/branches").send({})).status).toBe(403);
        expect((await agent.post(`/api/company/branches/${branchId}/deactivate`)).status).toBe(403);
      }
    });

    it("lists the branches with counts and filters", async () => {
      await insertUser(OTHER_BRANCH, "STORE", "Branches Tuzla", 1000, companyId);
      await pool.query("UPDATE users SET city_id = $1 WHERE email = $2", [await cityId("Kladanj"), OTHER_BRANCH]);
      const branch = await login(BRANCH);
      const product = await createProduct(branch);
      await reserve(restaurant, product.id, 1);

      const list = await hq.get("/api/company/branches");
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(2);
      expect(list.body.branches[0]).toMatchObject({
        id: branchId,
        business_name: "Branches Centar",
        email: BRANCH,
        status: "active",
        active_products: 1,
        pending_reservations: 1,
      });
      expect((await hq.get("/api/company/branches?q=tuzla")).body.total).toBe(1);
      expect((await hq.get(`/api/company/branches?city_id=${await cityId("Kladanj")}`)).body.total).toBe(1);
      await hq.post(`/api/company/branches/${branchId}/deactivate`);
      const deactivated = await hq.get("/api/company/branches?status=deactivated");
      expect(deactivated.body.branches.map((row: { id: number }) => row.id)).toEqual([branchId]);
      expect((await hq.get("/api/company/branches?status=closed")).status).toBe(400);
      expect((await hq.get("/api/company/me")).body.company).toMatchObject({ branch_count: 2, active_branch_count: 1 });
    });

    it("shows the branch's products, reservations and stats read-only", async () => {
      const branch = await login(BRANCH);
      const product = await createProduct(branch, { quantity: 10 });
      const reservation = await reserve(restaurant, product.id, 2);

      const products = await hq.get(`/api/company/branches/${branchId}/products?status=Available`);
      expect(products.body.products.map((row: { id: number }) => row.id)).toEqual([product.id]);
      expect(products.body).toEqual((await branch.get("/api/products/mine?status=Available")).body);
      const reservations = await hq.get(`/api/company/branches/${branchId}/reservations?status=Pending`);
      expect(reservations.body.reservations.map((row: { id: number }) => row.id)).toEqual([reservation]);
      expect((await hq.get(`/api/company/branches/${branchId}/products?status=Nope`)).status).toBe(400);

      const details = await hq.get(`/api/company/branches/${branchId}`);
      expect(details.body.stats).toEqual({
        active_products: 1,
        pending_reservations: 1,
        completed_this_month: 0,
        saved_this_month: { kg: 0, l: 0, pieces: 0 },
      });

      // The headquarters cannot act as the store.
      expect((await hq.patch(`/api/reservations/${reservation}/accept`)).status).toBe(403);
      expect((await hq.put(`/api/products/${product.id}`).send({})).status).toBe(403);
      expect((await hq.post(`/api/company/branches/${branchId}/products`).send({})).status).toBe(404);
    });
  });

  describe("logo and description", () => {
    it("falls back to the company's and lets the branch set and clear its own", async () => {
      await pool.query("UPDATE companies SET logo_url = '/uploads/logos/company-chain.png', description = 'Lanac' WHERE id = $1", [
        companyId,
      ]);
      const storeView = async () => (await restaurant.get(`/api/users/stores/${branchId}`)).body.store;
      expect(await storeView()).toMatchObject({
        logo_url: "/uploads/logos/company-chain.png",
        description: "Lanac",
        company_name: COMPANY,
      });
      const listed = (await restaurant.get("/api/users/stores?radius=all")).body.stores.find(
        (row: { id: number }) => row.id === branchId,
      );
      expect(listed).toMatchObject({ logo_url: "/uploads/logos/company-chain.png", company_name: COMPANY });

      // Its own values win; a later company change only shows where the branch has none.
      await pool.query("UPDATE users SET logo_url = '/uploads/logos/own.png' WHERE id = $1", [branchId]);
      const branch = await login(BRANCH);
      const profile = {
        first_name: "Ana",
        last_name: "Anić",
        address: "Titova 1",
        phone: "061 000",
        description: "Naša poslovnica",
      };
      await branch.put("/api/users/me").send(profile);
      await pool.query("UPDATE companies SET description = 'Novi opis' WHERE id = $1", [companyId]);
      expect(await storeView()).toMatchObject({ logo_url: "/uploads/logos/own.png", description: "Naša poslovnica" });

      // Clearing them shows the company's again.
      expect((await branch.delete("/api/users/me/logo")).body.message).toBe("Logo removed.");
      await branch.put("/api/users/me").send({ ...profile, description: "" });
      expect(await storeView()).toMatchObject({ logo_url: "/uploads/logos/company-chain.png", description: "Novi opis" });
      await restaurant.post("/api/favorites").send({ store_id: branchId });
      expect((await restaurant.get("/api/favorites")).body.favorites[0]).toMatchObject({
        company_name: COMPANY,
        description: "Novi opis",
      });
    });

    it("names the chain on products and product details, and nothing for an independent store", async () => {
      await insertUser(LONE_STORE, "STORE", "Branches Lone");
      const lone = await createProduct(await login(LONE_STORE));
      const chained = await createProduct(await login(BRANCH));
      const products = (await restaurant.get("/api/products?radius=all&name=")).body.products;
      expect(products.find((row: { id: number }) => row.id === chained.id).company_name).toBe(COMPANY);
      expect(products.find((row: { id: number }) => row.id === lone.id).company_name).toBeNull();
      expect((await restaurant.get(`/api/products/${chained.id}`)).body.product.company_name).toBe(COMPANY);
    });
  });

  describe("deactivation", () => {
    it("is refused while accepted pickups wait", async () => {
      const branch = await login(BRANCH);
      const product = await createProduct(branch, { quantity: 10 });
      for (const quantity of [1, 2]) {
        const id = await reserve(restaurant, product.id, quantity);
        await branch.patch(`/api/reservations/${id}/accept`);
      }
      const response = await hq.post(`/api/company/branches/${branchId}/deactivate`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "The branch still has accepted pickups (2). Wait until they are picked up or cancelled.",
      );
      const row = await pool.query("SELECT deactivated_at FROM users WHERE id = $1", [branchId]);
      expect(row.rows[0].deactivated_at).toBeNull();
    });

    it("cancels Pending reservations with refunds, hides the branch and blocks its login until reactivated", async () => {
      const branch = await login(BRANCH);
      const product = await createProduct(branch, { quantity: 10 });
      const pending = await reserve(restaurant, product.id, 2);
      await restaurant.post("/api/favorites").send({ store_id: branchId });

      const response = await hq.post(`/api/company/branches/${branchId}/deactivate`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: "Branch deactivated.", cancelledReservations: 1 });
      expect(await reservationStatus(pending)).toBe("Cancelled");
      expect(await notificationsOf(RESTAURANT)).toContainEqual(
        expect.objectContaining({ type: "RESERVATION_CANCELLED_STORE_CLOSED", reservation_id: pending, details: null }),
      );
      const refund = await pool.query(
        `SELECT actor FROM credit_transactions
         WHERE type = 'RESERVATION_REFUND' AND related_entity_type = 'reservation' AND related_entity_id = $1`,
        [pending],
      );
      expect(refund.rows).toEqual([{ actor: "USER" }]);
      // The headquarters' own action does not notify it.
      expect(await notificationsOf(HQ)).toEqual([]);

      // The products are hidden, not changed.
      expect((await pool.query("SELECT status FROM products WHERE id = $1", [product.id])).rows[0].status).toBe("Available");
      const products = (await restaurant.get("/api/products?radius=all")).body.products;
      expect(products.some((row: { id: number }) => row.id === product.id)).toBe(false);
      expect((await restaurant.get(`/api/products/${product.id}`)).status).toBe(404);
      expect((await restaurant.get(`/api/users/stores/${branchId}`)).status).toBe(404);
      expect((await restaurant.get("/api/favorites")).body.favorites).toEqual([]);
      const reservation = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 1, pickup_date: futurePickup(1) });
      expect(reservation.status).toBe(404);

      // The running session ends; a new login gets the deactivation message.
      expect((await branch.get("/api/users/me")).status).toBe(401);
      const attempt = await request(app).post("/api/auth/login").send({ email: BRANCH, password: PASSWORD });
      expect(attempt.status).toBe(403);
      expect(attempt.body.error).toBe("This branch has been deactivated. Contact your company.");
      const details = await hq.get(`/api/company/branches/${branchId}`);
      expect(details.body.branch).toMatchObject({ status: "deactivated", deactivated_by_email: HQ });
      expect((await hq.post(`/api/company/branches/${branchId}/deactivate`)).body.error).toBe(
        "Branch is already deactivated.",
      );

      const reactivate = await hq.post(`/api/company/branches/${branchId}/reactivate`);
      expect(reactivate.body.message).toBe("Branch reactivated.");
      expect((await restaurant.get(`/api/products/${product.id}`)).status).toBe(200);
      await expect(login(BRANCH)).resolves.toBeDefined();
      expect((await hq.post(`/api/company/branches/${branchId}/reactivate`)).body.error).toBe(
        "Branch is not deactivated.",
      );
    });
  });

  describe("admin", () => {
    it("attaches an existing store without a company", async () => {
      await insertUser(LONE_STORE, "STORE", "Branches Lone");
      const loneId = await userId(LONE_STORE);
      const response = await admin.post(`/api/admin/companies/${companyId}/branches/attach`).send({ user_id: loneId });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Store attached to the company.");
      expect((await hq.get(`/api/company/branches/${loneId}`)).status).toBe(200);

      const again = await admin.post(`/api/admin/companies/${companyId}/branches/attach`).send({ user_id: loneId });
      expect(again.body.error).toBe("Only a store without a company can be attached.");
      const restaurantAttach = await admin
        .post(`/api/admin/companies/${companyId}/branches/attach`)
        .send({ user_id: await userId(RESTAURANT) });
      expect(restaurantAttach.status).toBe(400);
      expect((await admin.post("/api/admin/companies/999999/branches/attach").send({ user_id: loneId })).status).toBe(404);

      const log = await admin.get(`/api/admin/actions?action=ATTACH_BRANCH&target_user_id=${loneId}`);
      expect(log.body.actions).toEqual([
        expect.objectContaining({ action: "ATTACH_BRANCH", target_company_id: companyId, company_name: COMPANY }),
      ]);
    });

    it("deactivates and reactivates with audit actions and tells the headquarters", async () => {
      const response = await admin.post(`/api/admin/companies/${companyId}/branches/${branchId}/deactivate`);
      expect(response.status).toBe(200);
      const reactivate = await admin.post(`/api/admin/companies/${companyId}/branches/${branchId}/reactivate`);
      expect(reactivate.status).toBe(200);
      expect((await notificationsOf(HQ)).map((row) => [row.type, row.branch_id])).toEqual([
        ["BRANCH_DEACTIVATED", branchId],
        ["BRANCH_REACTIVATED", branchId],
      ]);
      const details = await admin.get(`/api/admin/companies/${companyId}`);
      expect(details.body.actions.map((row: { action: string }) => row.action)).toEqual([
        "REACTIVATE_BRANCH",
        "DEACTIVATE_BRANCH",
      ]);
      expect(details.body.branches).toEqual([expect.objectContaining({ id: branchId, status: "active" })]);
      expect((await admin.post(`/api/admin/companies/${companyId}/branches/999999/deactivate`)).status).toBe(404);

      // The headquarters sees the branch notification with its name.
      const list = await hq.get("/api/notifications");
      expect(list.body.notifications[0]).toMatchObject({ branch_id: branchId, branch_name: "Branches Centar" });
    });

    it("tells the headquarters when one of its branches is blocked or unblocked, with the reason", async () => {
      await admin.post(`/api/admin/users/${branchId}/block`).send({ reason: "Kršenje" });
      await admin.post(`/api/admin/users/${branchId}/unblock`);
      expect(await notificationsOf(HQ)).toEqual([
        expect.objectContaining({ type: "BRANCH_BLOCKED", branch_id: branchId, details: "Kršenje" }),
        expect.objectContaining({ type: "BRANCH_UNBLOCKED", branch_id: branchId }),
      ]);
      // A store without a company notifies nobody new.
      await insertUser(LONE_STORE, "STORE", "Branches Lone");
      await admin.post(`/api/admin/users/${await userId(LONE_STORE)}/block`).send({ reason: "X" });
      expect(await notificationsOf(HQ)).toHaveLength(2);
      const users = await admin.get("/api/admin/users?q=branches-branch");
      expect(users.body.users[0]).toMatchObject({ company_id: companyId, company_name: COMPANY });
    });
  });
});
