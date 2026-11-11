import pool from "../src/config/db.js";
import { expireProducts } from "../src/jobs/expireProducts.js";
import { sendReminders } from "../src/jobs/notificationReminders.js";
import { type Agent, cleanupUsers, createProduct, futurePickup, orderOf, registerAndLogin, reserve, userId, acceptItem } from "./helpers.js";

// What happens to orders when something outside them changes: an expired or removed product, a
// blocked user, an admin's cancel, the pickup reminder (docs/orders-design.md, section 8).
const STORE = "order-cascades-store@test.com";
const RESTAURANT = "order-cascades-restaurant@test.com";
const ADMIN = "order-cascades-admin@test.com";

let store: Agent;
let restaurant: Agent;
let admin: Agent;

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  admin = await registerAndLogin(ADMIN, "ADMIN");
});

afterEach(async () => {
  await cleanupUsers([STORE, RESTAURANT, ADMIN]);
});

// A two-item order: product A (which the test expires or removes) and product B.
const twoItemOrder = async (acceptPartial: boolean) => {
  const a = await createProduct(store, { name: "A", quantity: 10 });
  const b = await createProduct(store, { name: "B", quantity: 10 });
  const response = await restaurant.post("/api/orders").send({
    pickup_at: futurePickup(),
    accept_partial: acceptPartial,
    items: [
      { product_id: a.id, quantity: 2, unit_price: 5 },
      { product_id: b.id, quantity: 3, unit_price: 5 },
    ],
  });
  expect(response.status).toBe(201);
  return { orderId: response.body.order.id as number, a, b };
};

const state = async (orderId: number) => {
  const order = await pool.query("SELECT status FROM orders WHERE id = $1", [orderId]);
  const items = await pool.query("SELECT status FROM reservations WHERE order_id = $1 ORDER BY product_id", [orderId]);
  return { order: order.rows[0].status, items: items.rows.map((row) => row.status) };
};

const restaurantTypes = async () =>
  (await restaurant.get("/api/notifications")).body.notifications.map((n: { type: string }) => n.type);

describe("the expiry job", () => {
  it("cancels only the expired item when partial fulfilment is on", async () => {
    const { orderId, a } = await twoItemOrder(true);
    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [a.id]);
    await expireProducts();
    expect(await state(orderId)).toEqual({ order: "Pending", items: ["Cancelled", "Pending"] });
    expect(await restaurantTypes()).toContain("ORDER_ITEMS_EXPIRED");
    const itemRows = await pool.query(
      "SELECT COUNT(*) AS count FROM order_status_history WHERE order_id = $1 AND item_id IS NOT NULL AND source = 'SYSTEM'",
      [orderId],
    );
    expect(itemRows.rows[0].count).toBe("1");
  });

  it("cancels the whole order when partial fulfilment is off", async () => {
    const { orderId, a } = await twoItemOrder(false);
    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [a.id]);
    await expireProducts();
    expect(await state(orderId)).toEqual({ order: "Cancelled", items: ["Cancelled", "Cancelled"] });
    const types = await restaurantTypes();
    expect(types).toContain("ORDER_EXPIRED");
    expect(types).not.toContain("ORDER_ITEMS_EXPIRED");
  });
});

describe("moderation", () => {
  it("removes the product's items, or the whole order when partial fulfilment is off", async () => {
    const partial = await twoItemOrder(true);
    const whole = await twoItemOrder(false);
    for (const product of [partial.a, whole.a]) {
      const response = await admin.delete(`/api/admin/products/${product.id}`).send({ reason: "Neispravan opis" });
      expect(response.status).toBe(200);
    }
    expect(await state(partial.orderId)).toEqual({ order: "Pending", items: ["Cancelled", "Pending"] });
    expect(await state(whole.orderId)).toEqual({ order: "Cancelled", items: ["Cancelled", "Cancelled"] });
    const notes = (await restaurant.get("/api/notifications")).body.notifications;
    expect(notes).toContainEqual(expect.objectContaining({ type: "ORDER_ITEMS_REMOVED", order_id: partial.orderId }));
    expect(notes).toContainEqual(expect.objectContaining({ type: "ORDER_CANCELLED_BY_ADMIN", order_id: whole.orderId }));
    // The admin's reason goes to the store only.
    expect(notes.every((n: { details: string | null }) => n.details === null)).toBe(true);
    const history = await pool.query(
      "SELECT source, reason FROM order_status_history WHERE order_id = $1 AND to_status = 'Cancelled' AND item_id IS NULL",
      [whole.orderId],
    );
    expect(history.rows).toEqual([{ source: "ADMIN", reason: "Neispravan opis" }]);
  });
});

describe("blocking", () => {
  it("cancels a blocked restaurant's whole Pending orders and tells the store once per order", async () => {
    const { orderId } = await twoItemOrder(true);
    const response = await admin.post(`/api/admin/users/${await userId(RESTAURANT)}/block`).send({ reason: "Test" });
    expect(response.body.cancelledOrders).toBe(1);
    expect(await state(orderId)).toEqual({ order: "Cancelled", items: ["Cancelled", "Cancelled"] });
    const storeNotes = (await store.get("/api/notifications")).body.notifications.filter(
      (n: { type: string }) => n.type === "ORDER_CANCELLED_BY_ADMIN",
    );
    expect(storeNotes).toHaveLength(1);
  });
});

describe("an admin's cancel", () => {
  it("cancels the whole Confirmed order, offers its products again and logs CANCEL_ORDER", async () => {
    const product = await createProduct(store, { quantity: 2 });
    const reservationId = await reserve(restaurant, product.id, 2);
    expect((await acceptItem(store, reservationId)).status).toBe(200);
    expect((await pool.query("SELECT status FROM products WHERE id = $1", [product.id])).rows[0].status).toBe("Sold");

    const orderId = await orderOf(reservationId);
    const response = await admin.post(`/api/admin/orders/${orderId}/cancel`).send({ reason: "Spor" });
    expect(response.status).toBe(200);
    expect(await state(orderId)).toEqual({ order: "Cancelled", items: ["Cancelled"] });
    expect((await pool.query("SELECT status FROM products WHERE id = $1", [product.id])).rows[0].status).toBe("Available");
    const action = await pool.query("SELECT action, target_order_id, target_reservation_id FROM admin_actions WHERE reason = 'Spor'");
    expect(action.rows).toEqual([{ action: "CANCEL_ORDER", target_order_id: orderId, target_reservation_id: null }]);
    const history = await pool.query(
      "SELECT source, actor_id, reason FROM order_status_history WHERE order_id = $1 AND to_status = 'Cancelled'",
      [orderId],
    );
    expect(history.rows).toEqual([{ source: "ADMIN", actor_id: await userId(ADMIN), reason: "Spor" }]);

    const again = await admin.post(`/api/admin/orders/${orderId}/cancel`).send({ reason: "Spor" });
    expect(again.body.error).toBe("Only pending or accepted orders can be cancelled.");
  });
});

describe("the pickup reminder", () => {
  it("reminds once per accepted order, however many items it has", async () => {
    const { orderId } = await twoItemOrder(true);
    await pool.query("UPDATE orders SET pickup_at = CURRENT_DATE + time '18:00' WHERE id = $1", [orderId]);
    const response = await store.post(`/api/orders/${orderId}/decision`).send({
      items: (
        await pool.query("SELECT id FROM reservations WHERE order_id = $1", [orderId])
      ).rows.map((row) => ({ item_id: row.id, action: "ACCEPT" })),
    });
    expect(response.status).toBe(200);

    await sendReminders();
    await sendReminders();
    const reminders = (await restaurant.get("/api/notifications")).body.notifications.filter(
      (n: { type: string }) => n.type === "ORDER_PICKUP_TODAY",
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ order_id: orderId, order_item_count: 2 });
  });
});
