import pool from "../src/config/db.js";
import {
  cityId,
  cleanupUsers,
  createProduct,
  registerAndLogin,
  reserve,
  type Agent,
  acceptItem,
  itemOrderAction,
  orderOf,
} from "./helpers.js";

const STORE_A = "order-lists-store-a@test.com";
const STORE_B = "order-lists-store-b@test.com";
const RESTAURANT_A = "order-lists-restaurant-a@test.com";
const RESTAURANT_B = "order-lists-restaurant-b@test.com";

let store: Agent;
let restaurant: Agent;

// A one-item order of `quantity`; returns the order's id.
const order = async (agent: Agent, productId: number, quantity = 1) => orderOf(await reserve(agent, productId, quantity));

// Moves a one-item order and its item to a status straight in the database.
const setStatus = async (orderId: number, status: string) => {
  await pool.query("UPDATE orders SET status = $2 WHERE id = $1", [orderId, status]);
  await pool.query("UPDATE reservations SET status = $2 WHERE order_id = $1", [orderId, status]);
};

// The order lists' filters, sorts, scopes and summary (GET /api/orders/mine, /mine/summary, /store).
describe("order lists", () => {
  beforeEach(async () => {
    store = await registerAndLogin(STORE_A, "STORE");
    restaurant = await registerAndLogin(RESTAURANT_A, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT_A, RESTAURANT_B]);
  });

  describe("GET /api/orders/mine", () => {
    it("returns only the restaurant's own orders with their items and store", async () => {
      const product = await createProduct(store, { name: "Piletina" });
      const own = await order(restaurant, product.id);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      await reserve(restaurantB, product.id, 1);

      const response = await restaurant.get("/api/orders/mine");
      expect(response.status).toBe(200);
      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0]).toMatchObject({
        id: own,
        store_id: product.store_id,
        item_count: 1,
        items: [expect.objectContaining({ product_name: "Piletina", unit: "kg" })],
      });
    });

    it("filters by status and product name", async () => {
      const chicken = await createProduct(store, { name: "Piletina" });
      const milk = await createProduct(store, { name: "Mlijeko" });
      const pending = await order(restaurant, chicken.id);
      const cancelledItem = await reserve(restaurant, milk.id, 1);
      await itemOrderAction(restaurant, cancelledItem, "cancel");
      const cancelled = await orderOf(cancelledItem);

      const byStatus = await restaurant.get("/api/orders/mine").query({ status: "Cancelled" });
      expect(byStatus.body.orders.map((r: { id: number }) => r.id)).toEqual([cancelled]);

      const byName = await restaurant.get("/api/orders/mine").query({ name: "pilet" });
      expect(byName.body.orders.map((r: { id: number }) => r.id)).toEqual([pending]);
    });

    it("returns 403 for a STORE", async () => {
      const response = await store.get("/api/orders/mine");
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/orders/mine scope, sort and period", () => {
    // Five orders, one per status, sent one hour apart (Pending newest) unless moved.
    const seed = async () => {
      const product = await createProduct(store, { name: "Piletina", quantity: 50 });
      const ids: Record<string, number> = {};
      const statuses = ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"];
      for (const [index, status] of statuses.entries()) {
        const id = await order(restaurant, product.id);
        await setStatus(id, status);
        await pool.query("UPDATE orders SET created_at = CURRENT_TIMESTAMP - ($2 * interval '1 hour') WHERE id = $1", [
          id,
          index,
        ]);
        ids[status] = id;
      }
      return ids;
    };
    const idsOf = (response: { body: { orders: { id: number }[] } }) =>
      response.body.orders.map((r) => r.id);
    const setCreatedAt = (id: number, sql: string) =>
      pool.query(`UPDATE orders SET created_at = ${sql} WHERE id = $1`, [id]);

    it("keeps all statuses in the status order without scope or sort", async () => {
      const ids = await seed();
      // Oldest Pending last within its status: the status comes first.
      await setCreatedAt(ids.Pending!, "CURRENT_TIMESTAMP - interval '10 hours'");
      const response = await restaurant.get("/api/orders/mine");
      expect(idsOf(response)).toEqual([ids.Pending, ids.Confirmed, ids.Completed, ids.Rejected, ids.Cancelled]);
      expect(response.body.total).toBe(5);
    });

    it("returns only Pending and Confirmed for scope=active", async () => {
      const ids = await seed();
      const response = await restaurant.get("/api/orders/mine").query({ scope: "active" });
      expect(idsOf(response)).toEqual([ids.Pending, ids.Confirmed]);
      expect(response.body.total).toBe(2);

      const pending = await restaurant.get("/api/orders/mine").query({ scope: "active", status: "Pending" });
      expect(idsOf(pending)).toEqual([ids.Pending]);
      const completed = await restaurant.get("/api/orders/mine").query({ scope: "active", status: "Completed" });
      expect(completed.body.total).toBe(0);
    });

    it("combines scope=all with the status filter", async () => {
      const ids = await seed();
      const response = await restaurant.get("/api/orders/mine").query({ scope: "all", status: "Cancelled" });
      expect(idsOf(response)).toEqual([ids.Cancelled]);
      const all = await restaurant.get("/api/orders/mine").query({ scope: "all" });
      expect(all.body.total).toBe(5);
    });

    it("sorts newest first, by status or by the soonest pickup, ties by id DESC", async () => {
      const ids = await seed();
      await setCreatedAt(ids.Cancelled!, "CURRENT_TIMESTAMP + interval '1 hour'");
      await pool.query("UPDATE orders SET pickup_at = CURRENT_DATE + 5 WHERE id = ANY($1)", [
        [ids.Pending, ids.Confirmed],
      ]);
      await pool.query("UPDATE orders SET pickup_at = CURRENT_DATE + 2 WHERE id = $1", [ids.Rejected]);

      const newest = await restaurant.get("/api/orders/mine").query({ sort: "newest" });
      expect(idsOf(newest)).toEqual([ids.Cancelled, ids.Pending, ids.Confirmed, ids.Completed, ids.Rejected]);

      const byStatus = await restaurant.get("/api/orders/mine").query({ sort: "status" });
      expect(idsOf(byStatus)).toEqual([ids.Pending, ids.Confirmed, ids.Completed, ids.Rejected, ids.Cancelled]);

      // Completed and Cancelled keep tomorrow's pickup; equal pickups go by id DESC.
      const byPickup = await restaurant.get("/api/orders/mine").query({ scope: "active", sort: "pickup" });
      expect(idsOf(byPickup)).toEqual([ids.Confirmed, ids.Pending]);
      const allByPickup = await restaurant.get("/api/orders/mine").query({ sort: "pickup" });
      expect(idsOf(allByPickup)).toEqual([ids.Cancelled, ids.Completed, ids.Rejected, ids.Confirmed, ids.Pending]);
    });

    it.each([
      ["today", "CURRENT_DATE", "CURRENT_DATE - interval '1 minute'"],
      ["7d", "CURRENT_DATE - 6", "CURRENT_DATE - interval '6 days 1 minute'"],
      ["month", "date_trunc('month', CURRENT_DATE)", "date_trunc('month', CURRENT_DATE) - interval '1 minute'"],
    ])("period=%s counts from the local midnight", async (period, inside, outside) => {
      const product = await createProduct(store);
      const kept = await order(restaurant, product.id);
      const dropped = await order(restaurant, product.id);
      await setCreatedAt(kept, inside);
      await setCreatedAt(dropped, outside);

      const response = await restaurant.get("/api/orders/mine").query({ period });
      expect(idsOf(response)).toEqual([kept]);
      expect(response.body.total).toBe(1);
      const summary = await restaurant.get("/api/orders/mine/summary").query({ period });
      expect(summary.body.summary.total).toBe(1);
    });

    it("treats an empty period, scope and sort as not set", async () => {
      await seed();
      const response = await restaurant.get("/api/orders/mine").query({ period: "", scope: "", sort: "" });
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
        .get("/api/orders/mine")
        .query({ scope: "all", sort: "newest", name: "pilet", store_id: other.store_id, period: "7d", limit: 2 });
      expect(page.body.total).toBe(5);
      expect(idsOf(page)).toEqual([ids.Pending, ids.Confirmed]);

      const byStore = await restaurant.get("/api/orders/mine").query({ business_name: "druga" });
      expect(byStore.body.total).toBe(1);
    });
  });

  describe("GET /api/orders/mine/summary", () => {
    it("counts the caller's orders per status with the list's filters", async () => {
      const product = await createProduct(store, { name: "Piletina", quantity: 50 });
      const milk = await createProduct(store, { name: "Mlijeko" });
      const statuses = ["Pending", "Pending", "Confirmed", "Rejected", "Cancelled", "Cancelled", "Cancelled"];
      for (const status of statuses) {
        await setStatus(await order(restaurant, product.id), status);
      }
      await reserve(restaurant, milk.id, 1);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      await reserve(restaurantB, product.id, 1);

      // scope and status are ignored: the summary always counts every status.
      const response = await restaurant
        .get("/api/orders/mine/summary")
        .query({ name: "pilet", scope: "active", status: "Pending" });
      expect(response.status).toBe(200);
      expect(response.body.summary).toEqual({
        total: 7,
        active: 3,
        counts: { Pending: 2, Confirmed: 1, Completed: 0, Rejected: 1, Cancelled: 3 },
      });

      for (const status of ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"]) {
        const list = await restaurant.get("/api/orders/mine").query({ name: "pilet", status });
        expect(list.body.total).toBe(response.body.summary.counts[status]);
      }
      const active = await restaurant.get("/api/orders/mine").query({ name: "pilet", scope: "active" });
      expect(active.body.total).toBe(response.body.summary.active);

      const unfiltered = await restaurant.get("/api/orders/mine/summary");
      expect(unfiltered.body.summary.total).toBe(8);
    });

    it("returns 403 for a STORE", async () => {
      const response = await store.get("/api/orders/mine/summary");
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/orders/store", () => {
    it("returns the store's orders only, Pending first", async () => {
      const product = await createProduct(store);
      const firstItem = await reserve(restaurant, product.id, 1);
      const second = await order(restaurant, product.id);
      await acceptItem(store, firstItem);
      const first = await orderOf(firstItem);

      const storeB = await registerAndLogin(STORE_B, "STORE");
      const foreign = await createProduct(storeB);
      await reserve(restaurant, foreign.id, 1);

      const response = await store.get("/api/orders/store");
      expect(response.status).toBe(200);
      expect(response.body.orders.map((r: { id: number }) => r.id)).toEqual([second, first]);
    });

    it("filters by status", async () => {
      const product = await createProduct(store);
      const acceptedItem = await reserve(restaurant, product.id, 1);
      await reserve(restaurant, product.id, 1);
      await acceptItem(store, acceptedItem);
      const accepted = await orderOf(acceptedItem);

      const response = await store.get("/api/orders/store").query({ status: "Confirmed" });
      expect(response.body.orders.map((r: { id: number }) => r.id)).toEqual([accepted]);
    });

    it("filters by the restaurant's city_id", async () => {
      const [tuzla, zenica] = [await cityId("Tuzla"), await cityId("Zenica")];
      await pool.query("UPDATE users SET city_id = $1 WHERE email = $2", [tuzla, RESTAURANT_A]);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      await pool.query("UPDATE users SET city_id = $1 WHERE email = $2", [zenica, RESTAURANT_B]);
      const product = await createProduct(store);
      const inTuzla = await order(restaurant, product.id);
      await reserve(restaurantB, product.id, 1);

      const response = await store.get("/api/orders/store").query({ city_id: tuzla });
      expect(response.status).toBe(200);
      expect(response.body.orders).toEqual([expect.objectContaining({ id: inTuzla, city: "Tuzla" })]);

      const all = await store.get("/api/orders/store").query({ city_id: "" });
      expect(all.body.total).toBe(2);

      for (const value of ["999999", "abc"]) {
        const invalid = await store.get("/api/orders/store").query({ city_id: value });
        expect(invalid.status).toBe(400);
        expect(invalid.body.error).toBe("Invalid filter.");
      }
    });

    it("returns 403 for a RESTAURANT", async () => {
      const response = await restaurant.get("/api/orders/store");
      expect(response.status).toBe(403);
    });
  });

});
