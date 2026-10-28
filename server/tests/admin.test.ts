import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import {
  cityId,
  type Agent,
  cleanupUsers,
  createDonation,
  createProduct,
  giveSubscription,
  login,
  PASSWORD,
  registerAndLogin,
  reserve,
  userId,
} from "./helpers.js";

const ADMIN = "admin-admin@test.com";
const OTHER_ADMIN = "admin-other-admin@test.com";
const STORE = "admin-store@test.com";
const RESTAURANT = "admin-restaurant@test.com";
const NEW_USER = "admin-new-user@test.com";
const EMAILS = [ADMIN, OTHER_ADMIN, STORE, RESTAURANT, NEW_USER];

let admin: Agent;
let store: Agent;
let restaurant: Agent;

const notificationsOf = async (email: string) =>
  (
    await pool.query(
      `SELECT notifications.type, notifications.details, notifications.product_id,
         notifications.donation_id, notifications.reservation_id
       FROM notifications JOIN users ON notifications.user_id = users.id
       WHERE users.email = $1 ORDER BY notifications.id`,
      [email],
    )
  ).rows;

const actions = async () =>
  (
    await pool.query(
      `SELECT admin_actions.action, admin_actions.reason, admin_actions.target_user_id,
         admin_actions.target_product_id, admin_actions.target_donation_id
       FROM admin_actions JOIN users ON admin_actions.admin_id = users.id
       WHERE users.email = $1 ORDER BY admin_actions.id`,
      [ADMIN],
    )
  ).rows;

const reservationStatus = async (id: number) =>
  (await pool.query("SELECT status FROM reservations WHERE id = $1", [id])).rows[0].status;

describe("Admin", () => {
  beforeEach(async () => {
    admin = await registerAndLogin(ADMIN, "ADMIN");
    store = await registerAndLogin(STORE, "STORE");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers(EMAILS);
  });

  describe("access", () => {
    it.each([
      ["a store", () => store],
      ["a restaurant", () => restaurant],
    ])("refuses %s on every admin route", async (_, agent) => {
      for (const path of ["/api/admin/stats", "/api/admin/users", "/api/admin/products", "/api/admin/actions"]) {
        const response = await agent().get(path);
        expect(response.status).toBe(403);
        expect(response.body.error).toBe("You do not have the required role for this action.");
      }
    });

    it("refuses a visitor without a session", async () => {
      expect((await request(app).get("/api/admin/stats")).status).toBe(401);
    });

    it("keeps the admin out of the marketplace, reservations and reports", async () => {
      const product = await createProduct(store);
      const paths = [
        "/api/products",
        `/api/products/${product.id}`,
        "/api/reservations/pickups?scope=today",
        "/api/reservations/pickups/counts",
        "/api/reports/sales?from=2026-01-01&to=2026-01-31",
        `/api/users/stores/${await userId(STORE)}`,
        "/api/donations/mine",
      ];
      for (const path of paths) {
        expect((await admin.get(path)).status).toBe(403);
      }
      const reservation = await admin
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 1, pickup_date: "2030-01-01" });
      expect(reservation.status).toBe(403);
    });

    it("lets the admin read their profile and change only the name", async () => {
      const me = await admin.get("/api/users/me");
      expect(me.status).toBe(200);
      expect(me.body.user.role).toBe("ADMIN");

      const missing = await admin.put("/api/users/me").send({ first_name: "Ana" });
      expect(missing.status).toBe(400);
      expect(missing.body.error).toBe("First and last name are required.");

      const update = await admin
        .put("/api/users/me")
        .send({ first_name: "Ana", last_name: "Admin", business_name: "Ignored" });
      expect(update.status).toBe(200);
      expect(update.body.user).toMatchObject({ first_name: "Ana", last_name: "Admin" });
      expect(update.body.user.business_name).toBeUndefined();
    });
  });

  describe("creating accounts", () => {
    it.each(["STORE", "RESTAURANT", "ADMIN"])("creates a %s account with only an email and a password", async (role) => {
      const response = await admin.post("/api/admin/users").send({ role, email: NEW_USER, password: PASSWORD });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("User created successfully.");
      expect(response.body.user).toMatchObject({
        email: NEW_USER,
        role,
        first_name: null,
        business_name: null,
        is_blocked: false,
      });
      expect(response.body.user.password_hash).toBeUndefined();

      const created = await login(NEW_USER);
      expect((await created.get("/api/users/me")).body.user.role).toBe(role);
      expect(await actions()).toEqual([
        expect.objectContaining({ action: "CREATE_USER", target_user_id: response.body.user.id }),
      ]);
    });

    it.each([
      [{ email: NEW_USER, password: PASSWORD }, "Email, password and role are required."],
      [{ role: "CHARITY", email: NEW_USER, password: PASSWORD }, "Role must be STORE, RESTAURANT or ADMIN."],
      [{ role: "STORE", email: "not-an-email", password: PASSWORD }, "Email is not valid."],
      [{ role: "STORE", email: NEW_USER, password: "kratka" }, "Password must be at least 8 characters long."],
      [{ role: "STORE", email: STORE.toUpperCase(), password: PASSWORD }, "A user with this email already exists."],
    ])("rejects %j", async (body, message) => {
      const response = await admin.post("/api/admin/users").send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(message);
      expect(await actions()).toEqual([]);
    });

    it("hides a new store from restaurants until it fills in its profile", async () => {
      await admin.post("/api/admin/users").send({ role: "STORE", email: NEW_USER, password: PASSWORD });
      const newStore = await login(NEW_USER);
      // The admin's temporary password must be replaced before anything else works.
      await newStore.put("/api/users/me/password").send({ current_password: PASSWORD, new_password: "vlastita-lozinka" });
      // A new account has no subscription yet; publishing needs credits.
      await giveSubscription(await userId(NEW_USER), 5);
      const product = await createProduct(newStore, { name: "Hidden until profile" });

      const listed = async () => {
        const products = await restaurant.get("/api/products?name=Hidden until profile");
        const stores = await restaurant.get("/api/users/stores");
        return {
          product: products.body.products.some((row: { id: number }) => row.id === product.id),
          store: stores.body.stores.some((row: { id: number }) => row.id === product.store_id),
        };
      };
      expect(await listed()).toEqual({ product: false, store: false });

      const profile = await newStore
        .put("/api/users/me")
        .send({
          first_name: "Nova",
          last_name: "Prodavnica",
          business_name: "Nova",
          city_id: await cityId("Sarajevo"),
          address: "Titova 2",
          phone: "061000000",
        });
      expect(profile.status).toBe(200);
      expect(await listed()).toEqual({ product: true, store: true });
    });

    it("sets a new password", async () => {
      const storeId = await userId(STORE);
      const short = await admin.patch(`/api/admin/users/${storeId}/password`).send({ password: "kratka" });
      expect(short.status).toBe(400);
      expect(short.body.error).toBe("Password must be at least 8 characters long.");

      const response = await admin.patch(`/api/admin/users/${storeId}/password`).send({ password: "nova-lozinka" });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Password changed successfully.");
      await expect(login(STORE)).rejects.toThrow();
      await expect(login(STORE, "nova-lozinka")).resolves.toBeDefined();
      expect(await actions()).toEqual([
        expect.objectContaining({ action: "RESET_PASSWORD", target_user_id: storeId }),
      ]);

      const missing = await admin.patch("/api/admin/users/999999/password").send({ password: "nova-lozinka" });
      expect(missing.status).toBe(404);
      expect(missing.body.error).toBe("User not found.");
    });
  });

  describe("editing a profile", () => {
    const profile = {
      first_name: "Nova",
      last_name: "Vlasnica",
      business_name: "Market Ispravljen",
      city_id: 0, // Zenica, set in beforeAll
      phone: "061999999",
      address: "Glavna 1",
      opening_hours: "08-20",
    };

    beforeAll(async () => {
      profile.city_id = await cityId("Zenica");
    });

    it("lets the admin fix a store's profile and logs it", async () => {
      const storeId = await userId(STORE);
      await pool.query("UPDATE users SET logo_url = '/uploads/logos/keep.png' WHERE id = $1", [storeId]);

      const response = await admin
        .put(`/api/admin/users/${storeId}/profile`)
        .send({ ...profile, logo_url: "/uploads/logos/other.png" });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("User profile updated.");
      expect(response.body.user).toMatchObject({
        ...profile,
        city: "Zenica",
        email: STORE,
        logo_url: "/uploads/logos/keep.png",
      });
      expect(await actions()).toEqual([expect.objectContaining({ action: "UPDATE_PROFILE", target_user_id: storeId })]);
    });

    it("validates like the user's own profile form", async () => {
      const response = await admin
        .put(`/api/admin/users/${await userId(STORE)}/profile`)
        .send({ ...profile, phone: "" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("First name, last name, business name, city, address and phone are required.");
      expect(await actions()).toEqual([]);
    });

    it("requires a city from the list", async () => {
      const storeId = await userId(STORE);
      const missing = await admin.put(`/api/admin/users/${storeId}/profile`).send({ ...profile, city_id: "" });
      expect(missing.status).toBe(400);
      expect(missing.body.error).toBe("First name, last name, business name, city, address and phone are required.");

      const unknown = await admin.put(`/api/admin/users/${storeId}/profile`).send({ ...profile, city_id: 999999 });
      expect(unknown.status).toBe(400);
      expect(unknown.body.error).toBe("Invalid city.");
      expect(await actions()).toEqual([]);
    });

    it("changes only the name of an admin", async () => {
      const other = await registerAndLogin(OTHER_ADMIN, "ADMIN");
      const response = await admin
        .put(`/api/admin/users/${await userId(OTHER_ADMIN)}/profile`)
        .send({ first_name: "Druga", last_name: "Adminka", business_name: "Ignored" });
      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({ first_name: "Druga", last_name: "Adminka", business_name: null });
      expect((await other.get("/api/users/me")).body.user.first_name).toBe("Druga");
    });

    it("makes a new store visible once the admin fills in its business name", async () => {
      await admin.post("/api/admin/users").send({ role: "STORE", email: NEW_USER, password: PASSWORD });
      const newStoreId = await userId(NEW_USER);
      const listed = async () =>
        (await restaurant.get("/api/users/stores")).body.stores.some((row: { id: number }) => row.id === newStoreId);
      expect(await listed()).toBe(false);

      await admin.put(`/api/admin/users/${newStoreId}/profile`).send(profile);
      expect(await listed()).toBe(true);
    });

    it("answers 404 for a missing user and 403 for other roles", async () => {
      expect((await admin.put("/api/admin/users/999999/profile").send(profile)).status).toBe(404);
      expect((await store.put(`/api/admin/users/${await userId(RESTAURANT)}/profile`).send(profile)).status).toBe(403);
    });
  });

  describe("users", () => {
    it("lists users with filters and paging", async () => {
      const all = await admin.get("/api/admin/users?q=admin-");
      expect(all.status).toBe(200);
      expect(all.body.total).toBe(3);
      expect(all.body.users[0].password_hash).toBeUndefined();

      const stores = await admin.get("/api/admin/users?q=admin-&role=STORE");
      expect(stores.body.users.map((user: { email: string }) => user.email)).toEqual([STORE]);

      const page = await admin.get("/api/admin/users?q=admin-&limit=2&offset=2");
      expect(page.body.users).toHaveLength(1);
      expect(page.body.total).toBe(3);

      for (const query of ["role=CHARITY", "blocked=maybe", "limit=0", "limit=101", "offset=-1", "city_id=999999", "city_id=abc"]) {
        const response = await admin.get(`/api/admin/users?${query}`);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid filter.");
      }
    });

    it("filters by city_id, and an empty city_id means all cities", async () => {
      const tuzla = await cityId("Tuzla");
      await pool.query("UPDATE users SET city_id = $1 WHERE email = $2", [tuzla, STORE]);

      const response = await admin.get("/api/admin/users").query({ q: "admin-", city_id: tuzla });
      expect(response.status).toBe(200);
      expect(response.body.users).toEqual([expect.objectContaining({ email: STORE, city_id: tuzla, city: "Tuzla" })]);

      const all = await admin.get("/api/admin/users").query({ q: "admin-", city_id: "" });
      expect(all.body.total).toBe(3);
    });

    it("shows a user with counts and the admin actions on them", async () => {
      const product = await createProduct(store);
      await reserve(restaurant, product.id, 2);
      const storeId = await userId(STORE);
      await admin.patch(`/api/admin/users/${storeId}/password`).send({ password: "nova-lozinka" });

      const response = await admin.get(`/api/admin/users/${storeId}`);
      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(STORE);
      expect(response.body.counts).toMatchObject({
        products: 1,
        active_products: 1,
        reservations: 1,
        pending_reservations: 1,
        donations: 0,
      });
      expect(response.body.actions).toEqual([
        expect.objectContaining({ action: "RESET_PASSWORD", admin_email: ADMIN }),
      ]);

      expect((await admin.get("/api/admin/users/999999")).status).toBe(404);
      expect((await admin.get("/api/admin/users/abc")).status).toBe(404);
    });
  });

  describe("blocking", () => {
    it("requires a reason", async () => {
      const storeId = await userId(STORE);
      for (const reason of [undefined, "   ", "x".repeat(501)]) {
        const response = await admin.post(`/api/admin/users/${storeId}/block`).send({ reason });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("A reason is required (at most 500 characters).");
      }
    });

    it("ends the session of a blocked user at once and refuses a new login", async () => {
      const storeId = await userId(STORE);
      const response = await admin.post(`/api/admin/users/${storeId}/block`).send({ reason: "Lažni proizvodi" });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Account blocked.");
      expect(response.body.user).toMatchObject({ is_blocked: true, blocked_reason: "Lažni proizvodi" });

      const session = await store.get("/api/users/me");
      expect(session.status).toBe(401);
      expect(session.body.error).toBe("Your account is blocked.");

      const attempt = await request(app).post("/api/auth/login").send({ email: STORE, password: PASSWORD });
      expect(attempt.status).toBe(403);
      expect(attempt.body.error).toBe("Your account is blocked. Reason: Lažni proizvodi");

      expect(await actions()).toEqual([
        expect.objectContaining({ action: "BLOCK_USER", reason: "Lažni proizvodi", target_user_id: storeId }),
      ]);
    });

    it("hides a blocked store and cancels Pending reservations but keeps Confirmed ones", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const pending = await reserve(restaurant, product.id, 2);
      const confirmed = await reserve(restaurant, product.id, 3);
      await store.patch(`/api/reservations/${confirmed}/accept`);
      await restaurant.post("/api/favorites").send({ store_id: product.store_id });

      const response = await admin
        .post(`/api/admin/users/${product.store_id}/block`)
        .send({ reason: "Kršenje pravila" });
      expect(response.body.cancelledReservations).toBe(1);
      expect(await reservationStatus(pending)).toBe("Cancelled");
      expect(await reservationStatus(confirmed)).toBe("Confirmed");

      // The restaurant is told; it never sees the admin's reason.
      expect(await notificationsOf(RESTAURANT)).toContainEqual(
        expect.objectContaining({ type: "RESERVATION_CANCELLED_BY_ADMIN", reservation_id: pending, details: null }),
      );

      const products = await restaurant.get("/api/products");
      expect(products.body.products.some((row: { id: number }) => row.id === product.id)).toBe(false);
      expect((await restaurant.get(`/api/products/${product.id}`)).status).toBe(404);
      expect((await restaurant.get(`/api/users/stores/${product.store_id}`)).status).toBe(404);
      expect((await restaurant.get("/api/favorites")).body.favorites).toEqual([]);
      const stores = await restaurant.get("/api/users/stores");
      expect(stores.body.stores.some((row: { id: number }) => row.id === product.store_id)).toBe(false);

      const reservation = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 1, pickup_date: new Date().toISOString() });
      expect(reservation.status).toBe(404);

      // Unblocking brings the store back.
      const unblock = await admin.post(`/api/admin/users/${product.store_id}/unblock`);
      expect(unblock.status).toBe(200);
      expect(unblock.body.message).toBe("Account unblocked.");
      expect(unblock.body.user).toMatchObject({ is_blocked: false, blocked_reason: null });
      expect((await restaurant.get(`/api/products/${product.id}`)).status).toBe(200);
      await expect(login(STORE)).resolves.toBeDefined();
      expect((await actions()).map((row) => row.action)).toEqual(["BLOCK_USER", "UNBLOCK_USER"]);
    });

    it("cancels a blocked restaurant's Pending reservations and tells the store", async () => {
      const product = await createProduct(store);
      const pending = await reserve(restaurant, product.id, 2);
      const restaurantId = await userId(RESTAURANT);

      await admin.post(`/api/admin/users/${restaurantId}/block`).send({ reason: "Ne dolazi po robu" });
      expect(await reservationStatus(pending)).toBe("Cancelled");
      expect(await notificationsOf(STORE)).toContainEqual(
        expect.objectContaining({ type: "RESERVATION_CANCELLED_BY_ADMIN", reservation_id: pending }),
      );
    });

    it("refuses to block the admin's own account, an already blocked one and a missing one", async () => {
      const own = await admin.post(`/api/admin/users/${await userId(ADMIN)}/block`).send({ reason: "Test" });
      expect(own.status).toBe(400);
      expect(own.body.error).toBe("You cannot block your own account.");

      const storeId = await userId(STORE);
      await admin.post(`/api/admin/users/${storeId}/block`).send({ reason: "Test" });
      const again = await admin.post(`/api/admin/users/${storeId}/block`).send({ reason: "Test" });
      expect(again.status).toBe(400);
      expect(again.body.error).toBe("Account is already blocked.");

      const restaurantId = await userId(RESTAURANT);
      const notBlocked = await admin.post(`/api/admin/users/${restaurantId}/unblock`);
      expect(notBlocked.status).toBe(400);
      expect(notBlocked.body.error).toBe("Account is not blocked.");

      expect((await admin.post("/api/admin/users/999999/block").send({ reason: "Test" })).status).toBe(404);
      expect((await admin.post("/api/admin/users/999999/unblock")).status).toBe(404);
    });

    it("lets an admin block another admin", async () => {
      const other = await registerAndLogin(OTHER_ADMIN, "ADMIN");
      const response = await admin
        .post(`/api/admin/users/${await userId(OTHER_ADMIN)}/block`)
        .send({ reason: "Napustio tim" });
      expect(response.status).toBe(200);
      expect((await other.get("/api/admin/stats")).status).toBe(401);
    });
  });

  describe("moderation", () => {
    it("removes a product, cancels its Pending reservations and tells the store why", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const pending = await reserve(restaurant, product.id, 2);
      const confirmed = await reserve(restaurant, product.id, 3);
      await store.patch(`/api/reservations/${confirmed}/accept`);

      const noReason = await admin.delete(`/api/admin/products/${product.id}`);
      expect(noReason.status).toBe(400);

      const response = await admin.delete(`/api/admin/products/${product.id}`).send({ reason: "Neispravan opis" });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Product removed.");
      expect(response.body.product.status).toBe("Removed");
      expect(await reservationStatus(pending)).toBe("Cancelled");
      expect(await reservationStatus(confirmed)).toBe("Confirmed");

      expect(await notificationsOf(STORE)).toContainEqual(
        expect.objectContaining({ type: "PRODUCT_REMOVED_BY_ADMIN", product_id: product.id, details: "Neispravan opis" }),
      );
      expect(await notificationsOf(RESTAURANT)).toContainEqual(
        expect.objectContaining({ type: "RESERVATION_CANCELLED_BY_ADMIN", reservation_id: pending }),
      );
      const listed = await store.get("/api/notifications");
      expect(listed.body.notifications[0]).toMatchObject({
        type: "PRODUCT_REMOVED_BY_ADMIN",
        details: "Neispravan opis",
        product_name: "Test Product",
      });

      expect(await actions()).toEqual([
        expect.objectContaining({
          action: "REMOVE_PRODUCT",
          reason: "Neispravan opis",
          target_product_id: product.id,
          target_user_id: product.store_id,
        }),
      ]);

      const again = await admin.delete(`/api/admin/products/${product.id}`).send({ reason: "Opet" });
      expect(again.status).toBe(400);
      expect(again.body.error).toBe("Product is already removed.");
      expect((await admin.delete("/api/admin/products/999999").send({ reason: "Test" })).status).toBe(404);
    });

    it("lists products of every store with filters", async () => {
      const product = await createProduct(store, { name: "Admin list product" });
      const response = await admin.get(`/api/admin/products?q=Admin list&store_id=${product.store_id}&status=Available`);
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.products[0]).toMatchObject({ id: product.id, store_email: STORE });
      expect((await admin.get("/api/admin/products?status=Gone")).status).toBe(400);
    });

    it("removes a donation and tells the donor why", async () => {
      const donation = await createDonation(restaurant, { name: "Admin donation" });
      const list = await admin.get("/api/admin/donations?q=Admin donation");
      expect(list.body.donations).toEqual([expect.objectContaining({ id: donation.id, donor_email: RESTAURANT })]);

      const response = await admin.delete(`/api/admin/donations/${donation.id}`).send({ reason: "Nije hrana" });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Donation removed.");
      expect((await restaurant.get(`/api/donations/${donation.id}`)).status).toBe(404);

      const listed = await restaurant.get("/api/notifications");
      expect(listed.body.notifications[0]).toMatchObject({
        type: "DONATION_REMOVED_BY_ADMIN",
        donation_id: donation.id,
        details: "Nije hrana",
        product_name: "Admin donation",
      });
      expect(await actions()).toEqual([
        expect.objectContaining({ action: "REMOVE_DONATION", target_donation_id: donation.id }),
      ]);

      const again = await admin.delete(`/api/admin/donations/${donation.id}`).send({ reason: "Opet" });
      expect(again.status).toBe(400);
      expect(again.body.error).toBe("Donation is already removed.");
      expect((await admin.get("/api/admin/donations?type=PAID")).status).toBe(400);
    });
  });

  describe("reservations", () => {
    const productStatus = async (id: number) =>
      (await pool.query("SELECT status FROM products WHERE id = $1", [id])).rows[0].status;

    it("lists every reservation with both parties and filters", async () => {
      const product = await createProduct(store, { name: "Admin reservation product" });
      const pending = await reserve(restaurant, product.id, 2);
      const confirmed = await reserve(restaurant, product.id, 3);
      await store.patch(`/api/reservations/${confirmed}/accept`);

      const all = await admin.get(`/api/admin/reservations?user_id=${product.store_id}`);
      expect(all.status).toBe(200);
      expect(all.body.total).toBe(2);
      expect(all.body.reservations[0]).toMatchObject({
        product_name: "Admin reservation product",
        store_email: STORE,
        restaurant_email: RESTAURANT,
        is_overdue: false,
      });

      const asRestaurant = await admin.get(`/api/admin/reservations?user_id=${await userId(RESTAURANT)}&status=Pending`);
      expect(asRestaurant.body.reservations.map((row: { id: number }) => row.id)).toEqual([pending]);

      const search = await admin.get(`/api/admin/reservations?q=${encodeURIComponent(RESTAURANT)}`);
      expect(search.body.total).toBe(2);

      expect((await admin.get("/api/admin/reservations?status=Lost")).status).toBe(400);
      expect((await admin.get("/api/admin/reservations?user_id=abc")).status).toBe(400);
      expect((await store.get("/api/admin/reservations")).status).toBe(403);
    });

    it("cancels a Pending reservation and tells both sides why", async () => {
      const product = await createProduct(store);
      const pending = await reserve(restaurant, product.id, 2);

      const noReason = await admin.post(`/api/admin/reservations/${pending}/cancel`);
      expect(noReason.status).toBe(400);
      expect(noReason.body.error).toBe("A reason is required (at most 500 characters).");

      const response = await admin.post(`/api/admin/reservations/${pending}/cancel`).send({ reason: "Spor oko cijene" });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Reservation cancelled.");
      expect(await reservationStatus(pending)).toBe("Cancelled");

      for (const email of [STORE, RESTAURANT]) {
        expect(await notificationsOf(email)).toContainEqual(
          expect.objectContaining({
            type: "RESERVATION_CANCELLED_BY_ADMIN",
            reservation_id: pending,
            details: "Spor oko cijene",
          }),
        );
      }
      expect(await actions()).toEqual([
        expect.objectContaining({ action: "CANCEL_RESERVATION", reason: "Spor oko cijene", target_product_id: product.id }),
      ]);

      // The store sees the cancellation in its history too, through its product.
      const storeHistory = await admin.get(`/api/admin/users/${product.store_id}`);
      expect(storeHistory.body.actions).toEqual([expect.objectContaining({ action: "CANCEL_RESERVATION" })]);
    });

    it("puts a Confirmed reservation's quantity back on offer", async () => {
      const product = await createProduct(store, { quantity: 5 });
      const confirmed = await reserve(restaurant, product.id, 5);
      await store.patch(`/api/reservations/${confirmed}/accept`);
      expect(await productStatus(product.id)).toBe("Sold");

      await admin.post(`/api/admin/reservations/${confirmed}/cancel`).send({ reason: "Prodavnica nema robu" });
      expect(await reservationStatus(confirmed)).toBe("Cancelled");
      expect(await productStatus(product.id)).toBe("Available");
      await expect(reserve(restaurant, product.id, 5)).resolves.toEqual(expect.any(Number));
    });

    it("keeps an expired sold-out product Sold", async () => {
      const product = await createProduct(store, { quantity: 5 });
      const confirmed = await reserve(restaurant, product.id, 5);
      await store.patch(`/api/reservations/${confirmed}/accept`);
      await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [product.id]);

      const response = await admin.post(`/api/admin/reservations/${confirmed}/cancel`).send({ reason: "Istekao rok" });
      expect(response.status).toBe(200);
      expect(await productStatus(product.id)).toBe("Sold");
    });

    it("refuses reservations that are already closed, and missing ones", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const completed = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${completed}/accept`);
      await store.patch(`/api/reservations/${completed}/complete`);
      const rejected = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${rejected}/reject`);
      const cancelled = await reserve(restaurant, product.id, 1);
      await restaurant.patch(`/api/reservations/${cancelled}/cancel`);

      for (const id of [completed, rejected, cancelled]) {
        const response = await admin.post(`/api/admin/reservations/${id}/cancel`).send({ reason: "Test" });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Only pending or accepted reservations can be cancelled.");
      }
      const missing = await admin.post("/api/admin/reservations/999999/cancel").send({ reason: "Test" });
      expect(missing.status).toBe(404);
      expect(missing.body.error).toBe("Reservation not found.");
      expect(await actions()).toEqual([]);
    });
  });

  describe("overview", () => {
    it("returns platform statistics as numbers", async () => {
      const response = await admin.get("/api/admin/stats");
      expect(response.status).toBe(200);
      const { stats } = response.body;
      expect(stats.users.admins).toBeGreaterThanOrEqual(1);
      expect(typeof stats.products.active).toBe("number");
      expect(Object.keys(stats.reservations)).toEqual(["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"]);
      expect(typeof stats.saved.kg).toBe("number");
      expect(typeof stats.donations.available).toBe("number");
    });

    it("counts food saved, value and savings over picked-up (Completed) reservations only", async () => {
      const savedNow = async () => (await admin.get("/api/admin/stats")).body.stats.saved;
      const before = await savedNow();

      const product = await createProduct(store, { unit: "l", quantity: 20, original_price: 10, discounted_price: 4 });
      const confirmed = await reserve(restaurant, product.id, 3);
      await store.patch(`/api/reservations/${confirmed}/accept`);
      const completed = await reserve(restaurant, product.id, 2);
      await store.patch(`/api/reservations/${completed}/accept`);
      await store.patch(`/api/reservations/${completed}/complete`);
      await reserve(restaurant, product.id, 5); // Pending: not saved yet

      const after = await savedNow();
      expect(after.l).toBeCloseTo(before.l + 2); // the Confirmed 3 l are not picked up yet
      expect(after.kg).toBeCloseTo(before.kg);
      expect(after.value).toBeCloseTo(before.value + 2 * 4);
      expect(after.savings).toBeCloseTo(before.savings + 2 * 6);
    });

    it("lists the audit log, newest first, with filters", async () => {
      const storeId = await userId(STORE);
      await admin.post(`/api/admin/users/${storeId}/block`).send({ reason: "Prvi" });
      await admin.post(`/api/admin/users/${storeId}/unblock`);

      const adminId = await userId(ADMIN);
      const response = await admin.get(`/api/admin/actions?admin_id=${adminId}`);
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.actions.map((row: { action: string }) => row.action)).toEqual(["UNBLOCK_USER", "BLOCK_USER"]);
      expect(response.body.actions[1]).toMatchObject({ admin_email: ADMIN, target_email: STORE, reason: "Prvi" });

      const blocks = await admin.get(`/api/admin/actions?admin_id=${adminId}&action=BLOCK_USER`);
      expect(blocks.body.total).toBe(1);
      expect((await admin.get("/api/admin/actions?action=DELETE_ALL")).status).toBe(400);
      expect((await admin.get("/api/admin/actions?target_user_id=abc")).status).toBe(400);
    });
  });
});
