import pool from "../src/config/db.js";
import {
  cityId,
  cleanupUsers,
  createProduct,
  registerAndLogin,
  orderOne,
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
const order = async (agent: Agent, productId: number, quantity = 1) => orderOf(await orderOne(agent, productId, quantity));

// Moves a one-item order and its item to a status straight in the database.
const setStatus = async (orderId: number, status: string) => {
  await pool.query("UPDATE orders SET status = $2 WHERE id = $1", [orderId, status]);
  await pool.query("UPDATE order_items SET status = $2 WHERE order_id = $1", [orderId, status]);
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
      await orderOne(restaurantB, product.id, 1);

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
      const cancelledItem = await orderOne(restaurant, milk.id, 1);
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

  describe("GET /api/orders/mine scope, sort and date range", () => {
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

    it("filters by the order date range, whole local days from midnight to midnight", async () => {
      const product = await createProduct(store);
      const before = await order(restaurant, product.id);
      const first = await order(restaurant, product.id);
      const last = await order(restaurant, product.id);
      const after = await order(restaurant, product.id);
      await setCreatedAt(before, "DATE '2026-03-10' - interval '1 minute'");
      await setCreatedAt(first, "DATE '2026-03-10'");
      await setCreatedAt(last, "DATE '2026-03-12' + interval '23 hours 59 minutes'");
      await setCreatedAt(after, "DATE '2026-03-13'");

      const both = await restaurant.get("/api/orders/mine").query({ from: "2026-03-10", to: "2026-03-12" });
      expect(idsOf(both)).toEqual([last, first]);
      expect(both.body.total).toBe(2);
      const summary = await restaurant.get("/api/orders/mine/summary").query({ from: "2026-03-10", to: "2026-03-12" });
      expect(summary.body.summary.total).toBe(2);
      // One day: from and to the same date.
      expect(idsOf(await restaurant.get("/api/orders/mine").query({ from: "2026-03-10", to: "2026-03-10" }))).toEqual([first]);
      // Only one bound.
      expect(idsOf(await restaurant.get("/api/orders/mine").query({ from: "2026-03-12" }))).toEqual([after, last]);
      expect(idsOf(await restaurant.get("/api/orders/mine").query({ to: "2026-03-10" }))).toEqual([first, before]);
    });

    it.each([
      [{ from: "2026-13-01" }],
      [{ to: "2026-02-31" }],
      [{ from: "abc" }],
      [{ from: "2026-03-12", to: "2026-03-10" }],
    ])("refuses the date range %o", async (query) => {
      const response = await restaurant.get("/api/orders/mine").query(query);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid filter.");
    });

    it("treats an empty date range, scope and sort as not set", async () => {
      await seed();
      const response = await restaurant.get("/api/orders/mine").query({ from: "", to: "", scope: "", sort: "" });
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(5);
    });

    it("combines with the name, store and paging filters", async () => {
      const ids = await seed();
      const other = await createProduct(store, { name: "Mlijeko" });
      await orderOne(restaurant, other.id, 1);
      const storeB = await registerAndLogin(STORE_B, "STORE");
      await pool.query("UPDATE users SET business_name = 'Druga radnja' WHERE email = $1", [STORE_B]);
      const elsewhere = await createProduct(storeB, { name: "Piletina" });
      await orderOne(restaurant, elsewhere.id, 1);

      const page = await restaurant
        .get("/api/orders/mine")
        .query({ scope: "all", sort: "newest", name: "pilet", store_id: other.store_id, from: "2000-01-01", limit: 2 });
      expect(page.body.total).toBe(5);
      expect(idsOf(page)).toEqual([ids.Pending, ids.Confirmed]);

      const byStore = await restaurant.get("/api/orders/mine").query({ q: "druga" });
      expect(byStore.body.total).toBe(1);
    });
  });

  describe("GET /api/orders/mine search and method", () => {
    it("q finds a product, the store's name or the order code", async () => {
      await pool.query("UPDATE users SET business_name = 'Zeleni Market', address = 'Zmaja od Bosne 8' WHERE email = $1", [STORE_A]);
      const chicken = await createProduct(store, { name: "Piletina" });
      const milk = await createProduct(store, { name: "Mlijeko" });
      const chickenOrder = await order(restaurant, chicken.id);
      const milkOrder = await order(restaurant, milk.id);
      const code = (await pool.query<{ code: string }>("SELECT code FROM orders WHERE id = $1", [milkOrder])).rows[0]!.code;

      const ids = async (q: string) =>
        (await restaurant.get("/api/orders/mine").query({ q, sort: "newest" })).body.orders.map((r: { id: number }) => r.id);
      expect(await ids("pilet")).toEqual([chickenOrder]);
      expect(await ids("zeleni")).toEqual([milkOrder, chickenOrder]);
      // The code with or without #, in any case; the summary counts the same orders.
      expect(await ids(`#${code.toLowerCase()}`)).toContain(milkOrder);
      expect(await ids(code)).toContain(milkOrder);
      expect(await ids("nema-takvog")).toEqual([]);
      const summary = await restaurant.get("/api/orders/mine/summary").query({ q: "pilet" });
      expect(summary.body.summary.total).toBe(1);

      // The store's address comes with each row, for the pickup step.
      const list = await restaurant.get("/api/orders/mine");
      expect(list.body.orders[0]).toMatchObject({ business_name: "Zeleni Market", party_address: "Zmaja od Bosne 8" });
    });

    it("method filters by pickup or delivery and refuses anything else", async () => {
      const product = await createProduct(store);
      const pickup = await order(restaurant, product.id);
      const delivery = await order(restaurant, product.id);
      await pool.query(
        `UPDATE orders SET fulfilment_method = 'DELIVERY', delivery_address = 'Butmirska cesta 2', delivery_latitude = 43.83,
           delivery_longitude = 18.31, delivery_fee_estimate = 3, delivery_estimated_at = NOW() WHERE id = $1`,
        [delivery],
      );

      const byPickup = await restaurant.get("/api/orders/mine").query({ method: "pickup" });
      expect(byPickup.body.orders.map((r: { id: number }) => r.id)).toEqual([pickup]);
      const byDelivery = await restaurant.get("/api/orders/mine").query({ method: "delivery", scope: "active" });
      expect(byDelivery.body.orders.map((r: { id: number }) => r.id)).toEqual([delivery]);
      expect((await restaurant.get("/api/orders/mine/summary").query({ method: "delivery" })).body.summary.total).toBe(1);
      expect((await restaurant.get("/api/orders/mine").query({ method: "" })).body.total).toBe(2);

      const invalid = await restaurant.get("/api/orders/mine").query({ method: "drone" });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toBe("Invalid filter.");
    });

    it("lists each item's change reason after a partial acceptance", async () => {
      const product = await createProduct(store, { name: "Tikvice", quantity: 10 });
      const orderId = await order(restaurant, product.id, 4);
      await pool.query(
        "UPDATE order_items SET status = 'Rejected', change_reason = 'NOT_ENOUGH_STOCK' WHERE order_id = $1",
        [orderId],
      );
      const list = await restaurant.get("/api/orders/mine");
      expect(list.body.orders[0].items[0]).toMatchObject({ status: "Rejected", change_reason: "NOT_ENOUGH_STOCK", change_note: null });
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
      await orderOne(restaurant, milk.id, 1);
      const restaurantB = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      await orderOne(restaurantB, product.id, 1);

      // scope and status are ignored: the summary always counts every status.
      const response = await restaurant
        .get("/api/orders/mine/summary")
        .query({ name: "pilet", scope: "active", status: "Pending" });
      expect(response.status).toBe(200);
      expect(response.body.summary).toEqual({
        total: 7,
        active: 3,
        counts: { Pending: 2, Confirmed: 1, InDelivery: 0, Completed: 0, Rejected: 1, Cancelled: 3 },
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
      const firstItem = await orderOne(restaurant, product.id, 1);
      const second = await order(restaurant, product.id);
      await acceptItem(store, firstItem);
      const first = await orderOf(firstItem);

      const storeB = await registerAndLogin(STORE_B, "STORE");
      const foreign = await createProduct(storeB);
      await orderOne(restaurant, foreign.id, 1);

      const response = await store.get("/api/orders/store");
      expect(response.status).toBe(200);
      expect(response.body.orders.map((r: { id: number }) => r.id)).toEqual([second, first]);
    });

    it("filters by status", async () => {
      const product = await createProduct(store);
      const acceptedItem = await orderOne(restaurant, product.id, 1);
      await orderOne(restaurant, product.id, 1);
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
      await orderOne(restaurantB, product.id, 1);

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


  // Every order view shows the other side's logo and the products' own images.
  describe("logos and images", () => {
    const setLogo = (email: string, logo: string | null) =>
      pool.query("UPDATE users SET logo_url = $2 WHERE email = $1", [email, logo]);

    it("give each side the other one's logo and the items' images", async () => {
      await setLogo(STORE_A, "/uploads/logos/store.png");
      await setLogo(RESTAURANT_A, "/uploads/logos/restaurant.png");
      const product = await createProduct(store, { name: "Hljeb", image_url: "suggested:bakery" });
      const itemId = await orderOne(restaurant, product.id, 1);
      const orderId = await orderOf(itemId);

      const mine = await restaurant.get("/api/orders/mine");
      expect(mine.body.orders[0]).toMatchObject({
        party_logo_url: "/uploads/logos/store.png",
        items: [expect.objectContaining({ image_url: "suggested:bakery" })],
      });
      const storeList = await store.get("/api/orders/store");
      expect(storeList.body.orders[0].party_logo_url).toBe("/uploads/logos/restaurant.png");

      const details = await restaurant.get(`/api/orders/${orderId}`);
      expect(details.body.order.store.logo_url).toBe("/uploads/logos/store.png");
      expect(details.body.order.restaurant.logo_url).toBe("/uploads/logos/restaurant.png");
      expect(details.body.order.items[0].image_url).toBe("suggested:bakery");

      await acceptItem(store, itemId);
      const pickups = await store.get("/api/orders/pickups").query({ scope: "upcoming" });
      expect(pickups.body.orders[0].party_logo_url).toBe("/uploads/logos/restaurant.png");
      const restaurantPickups = await restaurant.get("/api/orders/pickups").query({ scope: "upcoming" });
      expect(restaurantPickups.body.orders[0].party_logo_url).toBe("/uploads/logos/store.png");
    });

    it("are null without a logo or an image", async () => {
      const product = await createProduct(store);
      await order(restaurant, product.id);
      const mine = await restaurant.get("/api/orders/mine");
      expect(mine.body.orders[0].party_logo_url).toBeNull();
      expect(mine.body.orders[0].items[0].image_url).toBeNull();
    });
  });
});
