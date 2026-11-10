import pool from "../src/config/db.js";
import {
  cleanupUsers,
  createProduct,
  futureDate,
  registerAndLogin,
  reserve,
  userId,
  type Agent,
  insertOrderItem,
  acceptItem,
  itemOrderAction,
  orderOf,
} from "./helpers.js";

const STORE_A = "pickups-store-a@test.com";
const STORE_B = "pickups-store-b@test.com";
const RESTAURANT_A = "pickups-restaurant-a@test.com";
const RESTAURANT_B = "pickups-restaurant-b@test.com";

let store: Agent;
let restaurant: Agent;

// Inserts a one-item order with a chosen status and a pickup at `time` on CURRENT_DATE + `days`
// (the API only accepts future pickups and always starts as Pending).
const insertReservation = async (
  productId: number,
  restaurantEmail: string,
  { status = "Confirmed", days = 0, time = "10:00", quantity = 2 }: {
    status?: string;
    days?: number;
    time?: string;
    quantity?: number;
  } = {},
) => {
  const { itemId } = await insertOrderItem({
    productId,
    restaurantId: await userId(restaurantEmail),
    quantity,
    status,
    pickupAt: `(CURRENT_DATE + ${Number(days)}) + '${time}'::time`,
  });
  return itemId;
};

// The order of an item: the pickups list shows orders.
const orderIdOf = orderOf;

const reservationRow = async (id: number) =>
  (
    await pool.query<{ status: string; picked_up_at: Date | null }>(
      "SELECT status, picked_up_at FROM reservations WHERE id = $1",
      [id],
    )
  ).rows[0]!;

const productStatus = async (id: number) =>
  (await pool.query<{ status: string }>("SELECT status FROM products WHERE id = $1", [id])).rows[0]!.status;

const availableQuantity = async (productId: number) => {
  const response = await store.get(`/api/products/${productId}`);
  return parseFloat(response.body.product.available_quantity);
};

const notificationTypes = async (email: string) =>
  (
    await pool.query<{ type: string }>("SELECT type FROM notifications WHERE user_id = $1", [await userId(email)])
  ).rows.map((row) => row.type);

const ids = (body: { orders: { id: number }[] }) => body.orders.map((r) => r.id);

describe("Pickups", () => {
  beforeEach(async () => {
    store = await registerAndLogin(STORE_A, "STORE");
    restaurant = await registerAndLogin(RESTAURANT_A, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE_A, STORE_B, RESTAURANT_A, RESTAURANT_B]);
  });

  describe("GET /api/orders/pickups", () => {
    it("splits Confirmed orders into today (with overdue first) and upcoming, and lists Completed", async () => {
      const product = await createProduct(store, { quantity: 20 });
      const overdue = await insertReservation(product.id, RESTAURANT_A, { days: -2 });
      const earlier = await insertReservation(product.id, RESTAURANT_A, { days: 0, time: "00:00:01" });
      const later = await insertReservation(product.id, RESTAURANT_A, { days: 0, time: "23:59:59" });
      const upcoming = await insertReservation(product.id, RESTAURANT_A, { days: 2 });
      const completed = await insertReservation(product.id, RESTAURANT_A, { status: "Completed", days: -1 });
      await insertReservation(product.id, RESTAURANT_A, { status: "Pending", days: 0 });

      const today = await store.get("/api/orders/pickups?scope=today");
      expect(today.status).toBe(200);
      expect(ids(today.body)).toEqual([await orderIdOf(overdue), await orderIdOf(earlier), await orderIdOf(later)]);
      expect(today.body.orders[0]).toMatchObject({ is_overdue: true, days_overdue: 2 });
      // A pickup time that passed earlier today is not late yet; only a past day is.
      expect(today.body.orders[1]).toMatchObject({ is_overdue: false, days_overdue: 0 });
      expect(today.body.orders[2]).toMatchObject({ is_overdue: false, days_overdue: 0 });

      const next = await store.get("/api/orders/pickups?scope=upcoming");
      expect(ids(next.body)).toEqual([await orderIdOf(upcoming)]);

      const done = await store.get("/api/orders/pickups?scope=completed");
      expect(ids(done.body)).toEqual([await orderIdOf(completed)]);
      expect(done.body.orders[0].picked_up_at).not.toBeNull();
    });

    it("returns the other party: the restaurant to the store and the store to the restaurant", async () => {
      await pool.query("UPDATE users SET business_name = 'Bistro A', phone = '061111111' WHERE email = $1", [RESTAURANT_A]);
      await pool.query("UPDATE users SET business_name = 'Market A', pickup_hours = '8-16' WHERE email = $1", [STORE_A]);
      const product = await createProduct(store);
      await insertReservation(product.id, RESTAURANT_A);

      const storeView = await store.get("/api/orders/pickups?scope=today");
      expect(storeView.body.orders[0]).toMatchObject({ business_name: "Bistro A", party_phone: "061111111" });

      const restaurantView = await restaurant.get("/api/orders/pickups?scope=today");
      expect(restaurantView.body.orders[0]).toMatchObject({
        business_name: "Market A",
        party_pickup_hours: "8-16",
      });
    });

    it("shows only the caller's own pickups", async () => {
      const otherStore = await registerAndLogin(STORE_B, "STORE");
      const otherRestaurant = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
      const product = await createProduct(store);
      await insertReservation(product.id, RESTAURANT_A);

      expect((await otherStore.get("/api/orders/pickups?scope=today")).body.orders).toEqual([]);
      expect((await otherRestaurant.get("/api/orders/pickups?scope=today")).body.orders).toEqual([]);
      expect((await restaurant.get("/api/orders/pickups?scope=today")).body.orders).toHaveLength(1);
    });

    it("filters by product name", async () => {
      const milk = await createProduct(store, { name: "Mlijeko" });
      const bread = await createProduct(store, { name: "Hljeb" });
      const milkReservation = await insertReservation(milk.id, RESTAURANT_A);
      await insertReservation(bread.id, RESTAURANT_A);

      const response = await store.get("/api/orders/pickups?scope=today&name=mlij");
      expect(ids(response.body)).toEqual([await orderIdOf(milkReservation)]);
    });

    it.each(["", "scope=all"])("returns 400 for an invalid scope (%s)", async (query) => {
      const response = await store.get(`/api/orders/pickups?${query}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid filter.");
    });
  });

  describe("GET /api/orders/pickups/counts", () => {
    it("counts today, overdue, upcoming and completed pickups for both sides", async () => {
      const product = await createProduct(store, { quantity: 20 });
      await insertReservation(product.id, RESTAURANT_A, { days: -1 });
      await insertReservation(product.id, RESTAURANT_A, { days: 0, time: "00:00:01" });
      await insertReservation(product.id, RESTAURANT_A, { days: 3 });
      await insertReservation(product.id, RESTAURANT_A, { status: "Completed", days: -1 });

      const expected = { today: 2, overdue: 1, upcoming: 1, completed: 1 };
      const storeCounts = await store.get("/api/orders/pickups/counts");
      expect(storeCounts.status).toBe(200);
      expect(storeCounts.body.counts).toEqual(expected);
      expect((await restaurant.get("/api/orders/pickups/counts")).body.counts).toEqual(expected);
    });
  });

  describe("POST /api/orders/:id/complete", () => {
    it("marks a Confirmed order Completed and notifies the restaurant", async () => {
      const product = await createProduct(store);
      const id = await insertReservation(product.id, RESTAURANT_A, { days: -1 });

      const response = await itemOrderAction(store, id, "complete");
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Order marked as picked up.");
      const row = await reservationRow(id);
      expect(row.status).toBe("Completed");
      expect(row.picked_up_at).not.toBeNull();
      expect(await notificationTypes(RESTAURANT_A)).toContain("ORDER_COMPLETED");

      const again = await itemOrderAction(store, id, "complete");
      expect(again.status).toBe(400);
      expect(again.body.error).toBe("Only accepted orders can be marked as picked up.");
    });

    it("keeps the picked-up quantity out of stock", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const id = await reserve(restaurant, product.id, 6);
      await acceptItem(store, id);
      expect(await availableQuantity(product.id)).toBe(4);

      await itemOrderAction(store, id, "complete");
      expect(await availableQuantity(product.id)).toBe(4);

      const tooMuch = await restaurant.post("/api/orders").send({
        pickup_at: `${futureDate(0)}T23:00`,
        accept_partial: false,
        items: [{ product_id: product.id, quantity: 5, unit_price: 5 }],
      });
      expect(tooMuch.status).toBe(409);
      expect(tooMuch.body.lines).toMatchObject([{ kind: "QUANTITY_REDUCED", available: 4 }]);
    });

    it("still counts a Completed order as successful in the store statistics", async () => {
      const product = await createProduct(store);
      const id = await insertReservation(product.id, RESTAURANT_A);
      await itemOrderAction(store, id, "complete");

      const response = await restaurant.get(`/api/users/stores/${await userId(STORE_A)}`);
      expect(response.body.stats.successful_reservations).toBe("1");
    });

    it.each(["Pending", "Rejected", "Cancelled"])("returns 400 for a %s order", async (status) => {
      const product = await createProduct(store);
      const id = await insertReservation(product.id, RESTAURANT_A, { status });
      const response = await itemOrderAction(store, id, "complete");
      expect(response.status).toBe(400);
      expect(await reservationRow(id)).toMatchObject({ status });
    });

    it("returns 404 for another store and 403 for a restaurant", async () => {
      const otherStore = await registerAndLogin(STORE_B, "STORE");
      const product = await createProduct(store);
      const id = await insertReservation(product.id, RESTAURANT_A);

      const foreign = await itemOrderAction(otherStore, id, "complete");
      expect(foreign.status).toBe(404);
      expect(foreign.body.error).toBe("Order not found.");
      expect((await itemOrderAction(restaurant, id, "complete")).status).toBe(403);
      expect((await reservationRow(id)).status).toBe("Confirmed");
    });

    it("returns 404 for a missing order", async () => {
      const response = await store.post("/api/orders/999999/complete");
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Order not found.");
    });
  });

  describe("POST /api/orders/:id/cancel-overdue", () => {
    it("cancels an overdue pickup, frees the quantity and notifies the restaurant", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const id = await insertReservation(product.id, RESTAURANT_A, { days: -1, quantity: 4 });
      expect(await availableQuantity(product.id)).toBe(6);

      const response = await itemOrderAction(store, id, "cancel-overdue");
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Overdue order cancelled.");
      expect((await reservationRow(id)).status).toBe("Cancelled");
      expect(await availableQuantity(product.id)).toBe(10);
      expect(await notificationTypes(RESTAURANT_A)).toContain("ORDER_PICKUP_MISSED");
    });

    it("puts a sold-out product back on offer while it has not expired", async () => {
      const product = await createProduct(store, { quantity: 4 });
      const id = await insertReservation(product.id, RESTAURANT_A, { days: -1, quantity: 4 });
      await pool.query("UPDATE products SET status = 'Sold' WHERE id = $1", [product.id]);

      await itemOrderAction(store, id, "cancel-overdue");
      expect(await productStatus(product.id)).toBe("Available");
    });

    it("leaves an expired product as it is", async () => {
      const product = await createProduct(store, { quantity: 4 });
      const id = await insertReservation(product.id, RESTAURANT_A, { days: -2, quantity: 4 });
      await pool.query("UPDATE products SET status = 'Sold', expiry_date = CURRENT_DATE - 1 WHERE id = $1", [product.id]);

      const response = await itemOrderAction(store, id, "cancel-overdue");
      expect(response.status).toBe(200);
      expect(await productStatus(product.id)).toBe("Sold");
    });

    // Late only once the whole pickup day has passed: an earlier time today does not count.
    it.each([
      ["a future day", { days: 1 }],
      ["today, even after the pickup time", { days: 0, time: "00:00:01" }],
    ])("returns 400 for a pickup on %s", async (_label, when) => {
      const product = await createProduct(store);
      const id = await insertReservation(product.id, RESTAURANT_A, when);
      const response = await itemOrderAction(store, id, "cancel-overdue");
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Only overdue pickups can be cancelled.");
      expect((await reservationRow(id)).status).toBe("Confirmed");
    });

    it.each(["Pending", "Completed"])("returns 400 for a %s order", async (status) => {
      const product = await createProduct(store);
      const id = await insertReservation(product.id, RESTAURANT_A, { status, days: -1 });
      const response = await itemOrderAction(store, id, "cancel-overdue");
      expect(response.status).toBe(400);
      expect((await reservationRow(id)).status).toBe(status);
    });

    it("returns 404 for another store and a missing order, 403 for a restaurant", async () => {
      const otherStore = await registerAndLogin(STORE_B, "STORE");
      const product = await createProduct(store);
      const id = await insertReservation(product.id, RESTAURANT_A, { days: -1 });

      const foreign = await itemOrderAction(otherStore, id, "cancel-overdue");
      expect(foreign.status).toBe(404);
      expect((await itemOrderAction(restaurant, id, "cancel-overdue")).status).toBe(403);
      expect((await store.post("/api/orders/999999/cancel-overdue")).status).toBe(404);
      expect((await reservationRow(id)).status).toBe("Confirmed");
    });
  });
});
