import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { expireProducts } from "../src/jobs/expireProducts.js";
import { sendReminders } from "../src/jobs/notificationReminders.js";
import {
  cleanupUsers,
  createProduct,
  registerAndLogin,
  reserve,
  userId,
  type Agent,
  insertOrderItem,
  orderOf,
} from "./helpers.js";

const STORE = "notifications-store@test.com";
const RESTAURANT_A = "notifications-restaurant-a@test.com";
const RESTAURANT_B = "notifications-restaurant-b@test.com";

interface Notification {
  id: number;
  type: string;
  product_id: number | null;
  reservation_id: number | null;
  order_id: number | null;
}

let store: Agent;
let restaurant: Agent;
let otherRestaurant: Agent;

const notificationsOf = async (agent: Agent): Promise<Notification[]> =>
  (await agent.get("/api/notifications")).body.notifications;

// Inserts rows directly, for states the API cannot create (past expiry dates, chosen statuses).
const insertProduct = async (name: string, expiry: string, status = "Available") => {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO products (store_id, name, category, original_price, discounted_price, quantity, unit, expiry_date, status)
     VALUES ($1, $2, 'Dairy', 2, 1, 10, 'kom', ${expiry}, $3) RETURNING id`,
    [await userId(STORE), name, status],
  );
  return result.rows[0]!.id;
};

const insertReservation = async (productId: number, status: string, pickup: string) => {
  return insertOrderItem({
    productId,
    restaurantId: await userId(RESTAURANT_A),
    quantity: 2,
    unitPrice: 1,
    status,
    pickupAt: pickup,
  });
};

describe("Notifications", () => {
  beforeEach(async () => {
    store = await registerAndLogin(STORE, "STORE");
    restaurant = await registerAndLogin(RESTAURANT_A, "RESTAURANT");
    otherRestaurant = await registerAndLogin(RESTAURANT_B, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers([STORE, RESTAURANT_A, RESTAURANT_B]);
  });

  describe("created by order actions", () => {
    it("notifies the store about a new order with its code, item count and restaurant", async () => {
      const product = await createProduct(store, { name: "Piletina" });
      const orderId = await orderOf(await reserve(restaurant, product.id, 4));

      const response = await store.get("/api/notifications");
      expect(response.status).toBe(200);
      expect(response.body.unreadCount).toBe(1);
      const code = (await pool.query("SELECT code FROM orders WHERE id = $1", [orderId])).rows[0].code;
      expect(response.body.notifications[0]).toMatchObject({
        type: "ORDER_CREATED",
        order_id: orderId,
        order_code: code,
        order_item_count: 1,
        order_restaurant_name: "Test Business",
        reservation_id: null,
        is_read: false,
      });
    });

    it("notifies the restaurant on accept and the store when the product sells out", async () => {
      const product = await createProduct(store, { quantity: 4 });
      const reservationId = await reserve(restaurant, product.id, 4);

      const accept = await store.patch(`/api/reservations/${reservationId}/accept`);
      expect(accept.status).toBe(200);

      expect((await notificationsOf(restaurant))[0]).toMatchObject({
        type: "ORDER_ACCEPTED",
        order_id: await orderOf(reservationId),
      });
      const storeTypes = (await notificationsOf(store)).map((n) => n.type);
      expect(storeTypes).toEqual(expect.arrayContaining(["ORDER_CREATED", "PRODUCT_SOLD_OUT"]));
    });

    it("does not send a sold-out notification while quantity remains", async () => {
      const product = await createProduct(store, { quantity: 10 });
      const reservationId = await reserve(restaurant, product.id, 4);
      await store.patch(`/api/reservations/${reservationId}/accept`);

      const storeTypes = (await notificationsOf(store)).map((n) => n.type);
      expect(storeTypes).not.toContain("PRODUCT_SOLD_OUT");
    });

    it("notifies the restaurant on reject and the store on cancel", async () => {
      const product = await createProduct(store);
      const rejected = await reserve(restaurant, product.id, 2);
      const cancelled = await reserve(restaurant, product.id, 2);

      expect((await store.patch(`/api/reservations/${rejected}/reject`)).status).toBe(200);
      expect((await restaurant.patch(`/api/reservations/${cancelled}/cancel`)).status).toBe(200);

      expect((await notificationsOf(restaurant))[0]).toMatchObject({
        type: "ORDER_REJECTED",
        order_id: await orderOf(rejected),
      });
      expect((await notificationsOf(store))[0]).toMatchObject({
        type: "ORDER_CANCELLED",
        order_id: await orderOf(cancelled),
      });
    });

    it("does not create a notification when an action fails", async () => {
      const product = await createProduct(store);
      const reservationId = await reserve(restaurant, product.id, 1);
      await store.patch(`/api/reservations/${reservationId}/accept`);
      const before = (await notificationsOf(restaurant)).length;

      expect((await store.patch(`/api/reservations/${reservationId}/reject`)).status).toBe(400);
      expect(await notificationsOf(restaurant)).toHaveLength(before);
    });
  });

  describe("routes", () => {
    it("returns only the caller's own notifications", async () => {
      const product = await createProduct(store);
      await reserve(restaurant, product.id, 1);

      const response = await otherRestaurant.get("/api/notifications");
      expect(response.status).toBe(200);
      expect(response.body.notifications).toEqual([]);
      expect(response.body.unreadCount).toBe(0);
    });

    it("marks one and then all notifications as read", async () => {
      const product = await createProduct(store);
      await reserve(restaurant, product.id, 1);
      await reserve(restaurant, product.id, 1);

      const [first] = await notificationsOf(store);
      const one = await store.patch(`/api/notifications/${first!.id}/read`);
      expect(one.status).toBe(200);
      expect(one.body.message).toBe("Notification marked as read.");
      expect((await store.get("/api/notifications")).body.unreadCount).toBe(1);

      const all = await store.patch("/api/notifications/read-all");
      expect(all.status).toBe(200);
      expect(all.body.message).toBe("All notifications marked as read.");
      expect((await store.get("/api/notifications")).body.unreadCount).toBe(0);
    });

    it("deletes a single notification and then all read ones", async () => {
      const product = await createProduct(store);
      await reserve(restaurant, product.id, 1);
      await reserve(restaurant, product.id, 1);
      await reserve(restaurant, product.id, 1);

      const list = await notificationsOf(store);
      const removed = await store.delete(`/api/notifications/${list[0]!.id}`);
      expect(removed.status).toBe(200);
      expect(removed.body.message).toBe("Notification deleted.");

      await store.patch(`/api/notifications/${list[1]!.id}/read`);
      const cleared = await store.delete("/api/notifications/read");
      expect(cleared.status).toBe(200);
      expect(cleared.body.message).toBe("Read notifications deleted.");
      expect(cleared.body.deleted).toBe(1);

      expect((await notificationsOf(store)).map((n) => n.id)).toEqual([list[2]!.id]);
    });

    it("returns 404 when reading or deleting another user's notification", async () => {
      const product = await createProduct(store);
      await reserve(restaurant, product.id, 1);
      const [notification] = await notificationsOf(store);

      const read = await otherRestaurant.patch(`/api/notifications/${notification!.id}/read`);
      expect(read.status).toBe(404);
      expect(read.body.error).toBe("Notification not found.");

      const removed = await otherRestaurant.delete(`/api/notifications/${notification!.id}`);
      expect(removed.status).toBe(404);

      expect((await store.get("/api/notifications")).body.unreadCount).toBe(1);
    });

    it("returns 401 without a token", async () => {
      expect((await request(app).get("/api/notifications")).status).toBe(401);
    });
  });

  describe("expiry job", () => {
    it("expires the product, cancels Pending orders, keeps Confirmed ones and notifies", async () => {
      const productId = await insertProduct("Jogurt", "CURRENT_DATE - 1");
      const pending = await insertReservation(productId, "Pending", "NOW()");
      const confirmed = await insertReservation(productId, "Confirmed", "NOW()");

      await expireProducts();

      const product = await pool.query("SELECT status FROM products WHERE id = $1", [productId]);
      expect(product.rows[0].status).toBe("Expired");
      const statuses = await pool.query("SELECT id, status FROM orders WHERE id = ANY($1)", [
        [pending.orderId, confirmed.orderId],
      ]);
      const byId = Object.fromEntries(statuses.rows.map((r) => [r.id, r.status]));
      expect(byId[pending.orderId]).toBe("Cancelled");
      expect(byId[confirmed.orderId]).toBe("Confirmed");

      expect((await notificationsOf(store))[0]).toMatchObject({ type: "PRODUCT_EXPIRED", product_id: productId });
      const restaurantNotes = (await notificationsOf(restaurant)).filter((n) => n.type === "ORDER_EXPIRED");
      expect(restaurantNotes.map((n) => n.order_id)).toEqual([pending.orderId]);
    });

    it("leaves unexpired products, non-Available products and finished reservations alone", async () => {
      const fresh = await insertProduct("Svjež", "CURRENT_DATE");
      const sold = await insertProduct("Prodan", "CURRENT_DATE - 1", "Sold");
      const completed = await insertReservation(sold, "Completed", "NOW()");

      await expireProducts();

      const products = await pool.query("SELECT id, status FROM products WHERE id = ANY($1) ORDER BY id", [
        [fresh, sold],
      ]);
      expect(products.rows.map((p) => p.status)).toEqual(["Available", "Sold"]);
      const reservation = await pool.query("SELECT status FROM reservations WHERE id = $1", [completed.itemId]);
      expect(reservation.rows[0].status).toBe("Completed");
      expect(await notificationsOf(store)).toEqual([]);
    });
  });

  describe("reminder job", () => {
    it("sends each reminder once", async () => {
      const expiring = await insertProduct("Hljeb", "CURRENT_DATE + 1");
      await insertReservation(expiring, "Pending", "NOW() + interval '1 day'");
      const pickup = await insertProduct("Sir", "CURRENT_DATE + 5");
      const confirmed = await insertReservation(pickup, "Confirmed", "CURRENT_DATE + interval '12 hours'");

      await sendReminders();
      await sendReminders();

      const expiringNotes = (await notificationsOf(store)).filter((n) => n.type === "PRODUCT_EXPIRING_SOON");
      expect(expiringNotes).toHaveLength(1);
      expect(expiringNotes[0]!.product_id).toBe(expiring);

      const pickupNotes = (await notificationsOf(restaurant)).filter((n) => n.type === "ORDER_PICKUP_TODAY");
      expect(pickupNotes).toHaveLength(1);
      expect(pickupNotes[0]!.order_id).toBe(confirmed.orderId);
    });

    it("skips products without Pending requests and pickups that are not Confirmed or not today", async () => {
      const expiringNoPending = await insertProduct("Mlijeko", "CURRENT_DATE + 1");
      await insertReservation(expiringNoPending, "Confirmed", "NOW() + interval '3 days'");
      const notTomorrow = await insertProduct("Kajmak", "CURRENT_DATE + 3");
      await insertReservation(notTomorrow, "Pending", "NOW() + interval '3 days'");
      const pickupProduct = await insertProduct("Pavlaka", "CURRENT_DATE + 5");
      await insertReservation(pickupProduct, "Pending", "CURRENT_DATE + interval '12 hours'");
      await insertReservation(pickupProduct, "Confirmed", "CURRENT_DATE + interval '2 days'");

      await sendReminders();

      expect((await notificationsOf(store)).filter((n) => n.type === "PRODUCT_EXPIRING_SOON")).toEqual([]);
      expect((await notificationsOf(restaurant)).filter((n) => n.type === "ORDER_PICKUP_TODAY")).toEqual([]);
    });
  });
});
