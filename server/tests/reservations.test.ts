import pool from "../src/config/db.js";
import {
  cleanupUsers,
  createProduct,
  futurePickup,
  registerAndLogin,
  reserve,
  type Agent,
} from "./helpers.js";

const STORE_A = "reservations-store-a@test.com";
const STORE_B = "reservations-store-b@test.com";
const RESTAURANT_A = "reservations-restaurant-a@test.com";
const RESTAURANT_B = "reservations-restaurant-b@test.com";

let store: Agent;
let restaurant: Agent;

const availableQuantity = async (productId: number) => {
  const response = await store.get(`/api/products/${productId}`);
  return parseFloat(response.body.product.available_quantity);
};

const reservationStatus = async (id: number) =>
  (await pool.query<{ status: string }>("SELECT status FROM reservations WHERE id = $1", [id])).rows[0]!.status;

describe("Reservations routes", () => {
  beforeEach(async () => {
    store = await registerAndLogin(STORE_A, "STORE");
    restaurant = await registerAndLogin(RESTAURANT_A, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT_A, RESTAURANT_B]);
  });

  describe("POST /api/reservations", () => {
    it("creates a Pending reservation and reduces available_quantity", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 4, pickup_date: futurePickup() });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Reservation created successfully.");
      expect(response.body.reservation.status).toBe("Pending");
      expect(await availableQuantity(product.id)).toBe(6);
    });

    it("returns 400 when a field is missing", async () => {
      const product = await createProduct(store);
      const response = await restaurant.post("/api/reservations").send({ product_id: product.id, quantity: 1 });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("All fields are required.");
    });

    it.each([-5, "abc"])("returns 400 for quantity %s", async (quantity) => {
      const product = await createProduct(store);
      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity, pickup_date: futurePickup() });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Quantity must be greater than zero.");
      expect(await availableQuantity(product.id)).toBe(10);
    });

    it("returns 400 for an invalid pickup date", async () => {
      const product = await createProduct(store);
      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 1, pickup_date: "sutra" });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Pickup date is not valid.");
    });

    it("returns 400 when the quantity exceeds what is available", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 15, pickup_date: futurePickup() });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Not enough product available.");
    });

    it("returns 404 for a product that does not exist", async () => {
      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: 999999, quantity: 5, pickup_date: futurePickup() });
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Product not found.");
    });

    it.each([
      ["has expired", "UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1"],
      ["is sold", "UPDATE products SET status = 'Sold' WHERE id = $1"],
      ["is removed", "UPDATE products SET status = 'Removed' WHERE id = $1"],
    ])("returns 400 when the product %s", async (_case, updateSql) => {
      const product = await createProduct(store);
      await pool.query(updateSql, [product.id]);

      const response = await restaurant
        .post("/api/reservations")
        .send({ product_id: product.id, quantity: 2, pickup_date: futurePickup() });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Product is no longer available for reservation.");
    });

    it("returns 403 for a STORE", async () => {
      const response = await store
        .post("/api/reservations")
        .send({ product_id: 999999, quantity: 5, pickup_date: futurePickup() });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You do not have the required role for this action.");
    });

    it("lets several restaurants reserve parts of the same product", async () => {
      const product = await createProduct(store, { quantity: 20 });
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      await reserve(restaurant, product.id, 10);
      await reserve(restaurantB, product.id, 10);
      expect(await availableQuantity(product.id)).toBe(0);
    });

    it("prevents overselling when two reservations arrive at the same time", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      const body = { product_id: product.id, quantity: 8, pickup_date: futurePickup() };

      const [a, b] = await Promise.all([
        restaurant.post("/api/reservations").send(body),
        restaurantB.post("/api/reservations").send(body),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 400]);
      expect(await availableQuantity(product.id)).toBe(2);
    });
  });

  describe("GET /api/reservations/mine", () => {
    it("returns only the restaurant's own reservations with product and store info", async () => {
      const product = await createProduct(store, { name: "Piletina" });
      const own = await reserve(restaurant, product.id, 1);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      await reserve(restaurantB, product.id, 1);

      const response = await restaurant.get("/api/reservations/mine");
      expect(response.status).toBe(200);
      expect(response.body.reservations).toHaveLength(1);
      expect(response.body.reservations[0]).toMatchObject({ id: own, product_name: "Piletina", unit: "kg" });
    });

    it("filters by status and product name", async () => {
      const chicken = await createProduct(store, { name: "Piletina" });
      const milk = await createProduct(store, { name: "Mlijeko" });
      const pending = await reserve(restaurant, chicken.id, 1);
      const cancelled = await reserve(restaurant, milk.id, 1);
      await restaurant.patch(`/api/reservations/${cancelled}/cancel`);

      const byStatus = await restaurant.get("/api/reservations/mine").query({ status: "Cancelled" });
      expect(byStatus.body.reservations.map((r: { id: number }) => r.id)).toEqual([cancelled]);

      const byName = await restaurant.get("/api/reservations/mine").query({ name: "pilet" });
      expect(byName.body.reservations.map((r: { id: number }) => r.id)).toEqual([pending]);
    });

    it("returns 403 for a STORE", async () => {
      const response = await store.get("/api/reservations/mine");
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/reservations/mine scope, sort and period", () => {
    // Five reservations, one per status, made one hour apart (Pending newest) unless moved.
    const seed = async () => {
      const product = await createProduct(store, { name: "Piletina", quantity: 50 });
      const ids: Record<string, number> = {};
      const statuses = ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"];
      for (const [index, status] of statuses.entries()) {
        const id = await reserve(restaurant, product.id, 1);
        await pool.query(
          `UPDATE reservations SET status = $2, created_at = CURRENT_TIMESTAMP - ($3 * interval '1 hour')
           WHERE id = $1`,
          [id, status, index],
        );
        ids[status] = id;
      }
      return ids;
    };
    const idsOf = (response: { body: { reservations: { id: number }[] } }) =>
      response.body.reservations.map((r) => r.id);
    const setCreatedAt = (id: number, sql: string) =>
      pool.query(`UPDATE reservations SET created_at = ${sql} WHERE id = $1`, [id]);

    it("keeps all statuses in the status order without scope or sort", async () => {
      const ids = await seed();
      // Oldest Pending last within its status: the status comes first.
      await setCreatedAt(ids.Pending!, "CURRENT_TIMESTAMP - interval '10 hours'");
      const response = await restaurant.get("/api/reservations/mine");
      expect(idsOf(response)).toEqual([ids.Pending, ids.Confirmed, ids.Completed, ids.Rejected, ids.Cancelled]);
      expect(response.body.total).toBe(5);
    });

    it("returns only Pending and Confirmed for scope=active", async () => {
      const ids = await seed();
      const response = await restaurant.get("/api/reservations/mine").query({ scope: "active" });
      expect(idsOf(response)).toEqual([ids.Pending, ids.Confirmed]);
      expect(response.body.total).toBe(2);
    });

    it("combines scope=all with the status filter", async () => {
      const ids = await seed();
      const response = await restaurant.get("/api/reservations/mine").query({ scope: "all", status: "Cancelled" });
      expect(idsOf(response)).toEqual([ids.Cancelled]);
      const all = await restaurant.get("/api/reservations/mine").query({ scope: "all" });
      expect(all.body.total).toBe(5);
    });

    it("sorts newest first, by status or by the soonest pickup, ties by id DESC", async () => {
      const ids = await seed();
      await setCreatedAt(ids.Cancelled!, "CURRENT_TIMESTAMP + interval '1 hour'");
      await pool.query("UPDATE reservations SET pickup_date = CURRENT_DATE + 5 WHERE id = ANY($1)", [
        [ids.Pending, ids.Confirmed],
      ]);
      await pool.query("UPDATE reservations SET pickup_date = CURRENT_DATE + 2 WHERE id = $1", [ids.Rejected]);

      const newest = await restaurant.get("/api/reservations/mine").query({ sort: "newest" });
      expect(idsOf(newest)).toEqual([ids.Cancelled, ids.Pending, ids.Confirmed, ids.Completed, ids.Rejected]);

      const byStatus = await restaurant.get("/api/reservations/mine").query({ sort: "status" });
      expect(idsOf(byStatus)).toEqual([ids.Pending, ids.Confirmed, ids.Completed, ids.Rejected, ids.Cancelled]);

      // Completed and Cancelled keep tomorrow's pickup; equal pickups go by id DESC.
      const byPickup = await restaurant.get("/api/reservations/mine").query({ scope: "active", sort: "pickup" });
      expect(idsOf(byPickup)).toEqual([ids.Confirmed, ids.Pending]);
      const allByPickup = await restaurant.get("/api/reservations/mine").query({ sort: "pickup" });
      expect(idsOf(allByPickup)).toEqual([ids.Cancelled, ids.Completed, ids.Rejected, ids.Confirmed, ids.Pending]);
    });

    it.each([
      ["today", "CURRENT_DATE", "CURRENT_DATE - interval '1 minute'"],
      ["7d", "CURRENT_DATE - 6", "CURRENT_DATE - interval '6 days 1 minute'"],
      ["month", "date_trunc('month', CURRENT_DATE)", "date_trunc('month', CURRENT_DATE) - interval '1 minute'"],
    ])("period=%s counts from the local midnight", async (period, inside, outside) => {
      const product = await createProduct(store);
      const kept = await reserve(restaurant, product.id, 1);
      const dropped = await reserve(restaurant, product.id, 1);
      await setCreatedAt(kept, inside);
      await setCreatedAt(dropped, outside);

      const response = await restaurant.get("/api/reservations/mine").query({ period });
      expect(idsOf(response)).toEqual([kept]);
      expect(response.body.total).toBe(1);
      const summary = await restaurant.get("/api/reservations/mine/summary").query({ period });
      expect(summary.body.summary.total).toBe(1);
    });

    it("treats an empty period, scope and sort as not set", async () => {
      await seed();
      const response = await restaurant.get("/api/reservations/mine").query({ period: "", scope: "", sort: "" });
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(5);
    });

    it("combines with the name, store and paging filters", async () => {
      const ids = await seed();
      const other = await createProduct(store, { name: "Mlijeko" });
      await reserve(restaurant, other.id, 1);
      const storeB = await registerAndLogin(STORE_B, "STORE");
      await pool.query("UPDATE users SET business_name = 'Druga radnja' WHERE email = $1", [STORE_B]);
      const elsewhere = await createProduct(storeB, { name: "Piletina" });
      await reserve(restaurant, elsewhere.id, 1);

      const page = await restaurant
        .get("/api/reservations/mine")
        .query({ scope: "all", sort: "newest", name: "pilet", store_id: other.store_id, period: "7d", limit: 2 });
      expect(page.body.total).toBe(5);
      expect(idsOf(page)).toEqual([ids.Pending, ids.Confirmed]);

      const byStore = await restaurant.get("/api/reservations/mine").query({ business_name: "druga" });
      expect(byStore.body.total).toBe(1);
    });
  });

  describe("GET /api/reservations/mine/summary", () => {
    it("counts the caller's reservations per status with the list's filters", async () => {
      const product = await createProduct(store, { name: "Piletina", quantity: 50 });
      const milk = await createProduct(store, { name: "Mlijeko" });
      const statuses = ["Pending", "Pending", "Confirmed", "Rejected", "Cancelled", "Cancelled", "Cancelled"];
      for (const status of statuses) {
        const id = await reserve(restaurant, product.id, 1);
        await pool.query("UPDATE reservations SET status = $2 WHERE id = $1", [id, status]);
      }
      await reserve(restaurant, milk.id, 1);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      await reserve(restaurantB, product.id, 1);

      // scope and status are ignored: the summary always counts every status.
      const response = await restaurant
        .get("/api/reservations/mine/summary")
        .query({ name: "pilet", scope: "active", status: "Pending" });
      expect(response.status).toBe(200);
      expect(response.body.summary).toEqual({
        total: 7,
        active: 3,
        counts: { Pending: 2, Confirmed: 1, Completed: 0, Rejected: 1, Cancelled: 3 },
      });

      for (const status of ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"]) {
        const list = await restaurant.get("/api/reservations/mine").query({ name: "pilet", status });
        expect(list.body.total).toBe(response.body.summary.counts[status]);
      }
      const active = await restaurant.get("/api/reservations/mine").query({ name: "pilet", scope: "active" });
      expect(active.body.total).toBe(response.body.summary.active);

      const unfiltered = await restaurant.get("/api/reservations/mine/summary");
      expect(unfiltered.body.summary.total).toBe(8);
    });

    it("returns 403 for a STORE", async () => {
      const response = await store.get("/api/reservations/mine/summary");
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/reservations/store", () => {
    it("returns reservations for the store's products only, Pending first", async () => {
      const product = await createProduct(store);
      const first = await reserve(restaurant, product.id, 1);
      const second = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${first}/accept`);

      const storeB = await registerAndLogin(STORE_B, "STORE");
      const foreign = await createProduct(storeB);
      await reserve(restaurant, foreign.id, 1);

      const response = await store.get("/api/reservations/store");
      expect(response.status).toBe(200);
      expect(response.body.reservations.map((r: { id: number }) => r.id)).toEqual([second, first]);
    });

    it("filters by status", async () => {
      const product = await createProduct(store);
      const accepted = await reserve(restaurant, product.id, 1);
      await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${accepted}/accept`);

      const response = await store.get("/api/reservations/store").query({ status: "Confirmed" });
      expect(response.body.reservations.map((r: { id: number }) => r.id)).toEqual([accepted]);
    });

    it("returns 403 for a RESTAURANT", async () => {
      const response = await restaurant.get("/api/reservations/store");
      expect(response.status).toBe(403);
    });
  });

  describe("PATCH /api/reservations/:id/accept", () => {
    it("confirms a Pending reservation", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 2);

      const response = await store.patch(`/api/reservations/${id}/accept`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Reservation accepted successfully.");
      expect(await reservationStatus(id)).toBe("Confirmed");
    });

    it("marks the product Sold once confirmed reservations cover the quantity", async () => {
      const product = await createProduct(store, { quantity: 4 });
      const id = await reserve(restaurant, product.id, 4);
      await store.patch(`/api/reservations/${id}/accept`);

      const response = await store.get(`/api/products/${product.id}`);
      expect(response.body.product.status).toBe("Sold");
    });

    it("returns 403 for another store", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      const storeB = await registerAndLogin(STORE_B, "STORE");

      const response = await storeB.patch(`/api/reservations/${id}/accept`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You are not allowed to accept this reservation.");
      expect(await reservationStatus(id)).toBe("Pending");
    });

    it("returns 403 for a RESTAURANT", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      const response = await restaurant.patch(`/api/reservations/${id}/accept`);
      expect(response.status).toBe(403);
    });

    it("returns 404 for a reservation that does not exist", async () => {
      const response = await store.patch("/api/reservations/999999/accept");
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Reservation not found.");
    });

    it("returns 400 when the reservation is not Pending", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${id}/accept`);

      const response = await store.patch(`/api/reservations/${id}/accept`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Reservation is not in 'Pending' status.");
    });

    it("returns 400 when the product has expired", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [product.id]);

      const response = await store.patch(`/api/reservations/${id}/accept`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "The reservation cannot be accepted because the product has expired.",
      );
    });
  });

  describe("PATCH /api/reservations/:id/reject", () => {
    it("rejects a Pending reservation and frees the quantity", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const id = await reserve(restaurant, product.id, 4);

      const response = await store.patch(`/api/reservations/${id}/reject`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Reservation rejected successfully.");
      expect(await reservationStatus(id)).toBe("Rejected");
      expect(await availableQuantity(product.id)).toBe(10);
    });

    it("returns 403 for another store", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      const storeB = await registerAndLogin(STORE_B, "STORE");

      const response = await storeB.patch(`/api/reservations/${id}/reject`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You are not allowed to reject this reservation.");
    });

    it("returns 404 for a reservation that does not exist", async () => {
      const response = await store.patch("/api/reservations/999999/reject");
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Reservation not found.");
    });

    it("returns 400 when the reservation is not Pending", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${id}/accept`);

      const response = await store.patch(`/api/reservations/${id}/reject`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Reservation is not in 'Pending' status.");
    });
  });

  describe("PATCH /api/reservations/:id/cancel", () => {
    it("cancels the restaurant's own Pending reservation and frees the quantity", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const id = await reserve(restaurant, product.id, 3);

      const response = await restaurant.patch(`/api/reservations/${id}/cancel`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Reservation cancelled successfully.");
      expect(await reservationStatus(id)).toBe("Cancelled");
      expect(await availableQuantity(product.id)).toBe(10);
    });

    it("returns 403 for another restaurant", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");

      const response = await restaurantB.patch(`/api/reservations/${id}/cancel`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("You are not allowed to cancel this reservation.");
    });

    it("returns 404 for a reservation that does not exist", async () => {
      const response = await restaurant.patch("/api/reservations/999999/cancel");
      expect(response.status).toBe(404);
    });

    it("returns 400 when the reservation is already confirmed", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${id}/accept`);

      const response = await restaurant.patch(`/api/reservations/${id}/cancel`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Reservation is not in 'Pending' status.");
    });
  });

  describe("GET /api/reservations/:id", () => {
    it("returns the store and restaurant details to the store", async () => {
      const product = await createProduct(store);
      const profile = await restaurant.put("/api/users/me").send({
        first_name: "Restaurant",
        last_name: "A",
        business_name: "Restoran Test",
        city: "Sarajevo",
        phone: "061111222",
        address: "Ulica 1",
      });
      expect(profile.status).toBe(200);
      const id = await reserve(restaurant, product.id, 2);

      const response = await store.get(`/api/reservations/${id}`);
      expect(response.status).toBe(200);
      expect(response.body.reservation).toMatchObject({
        product_id: product.id,
        store_id: product.store_id,
        restaurant_name: "Restoran Test",
        restaurant_city: "Sarajevo",
        restaurant_phone: "061111222",
        restaurant_address: "Ulica 1",
      });
    });

    it("returns the reservation to the restaurant that made it", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 2);
      const response = await restaurant.get(`/api/reservations/${id}`);
      expect(response.status).toBe(200);
      expect(response.body.reservation.id).toBe(id);
    });

    it("returns 404 to a restaurant that did not make the reservation", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 2);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");

      const response = await restaurantB.get(`/api/reservations/${id}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("No reservation exists with that ID");
    });

    it("returns 404 to a store that does not own the product", async () => {
      const product = await createProduct(store);
      const id = await reserve(restaurant, product.id, 2);
      const storeB = await registerAndLogin(STORE_B, "STORE");

      const response = await storeB.get(`/api/reservations/${id}`);
      expect(response.status).toBe(404);
    });
  });
});
