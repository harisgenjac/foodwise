import pool from "../src/config/db.js";
import { autoRejectOrders } from "../src/jobs/autoRejectOrders.js";
import { freeQuantity } from "../src/services/stock.js";
import { type Agent, cityId, cleanupUsers, createProduct, orderOne, registerAndLogin, userId } from "./helpers.js";

// Automatic rejection (delivery phase 2): a Pending order the store did not answer in time (a
// delivery order after 15 minutes, a pickup order at its pickup time) is rejected by the job.
const STORE = "auto-reject-store@test.com";
const RESTAURANT = "auto-reject-restaurant@test.com";

let store: Agent;
let restaurant: Agent;
let storeId: number;
let restaurantId: number;

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  storeId = await userId(STORE);
  restaurantId = await userId(RESTAURANT);
  const sarajevo = await cityId("Sarajevo");
  // Sarajevo centre → Ilidža, inside the mock's zone (tests/cartDelivery.test.ts).
  await pool.query(
    "UPDATE users SET city_id = $2, address = 'Ferhadija 1', phone = '033000000', latitude = 43.8563, longitude = 18.4131 WHERE id = $1",
    [storeId, sarajevo],
  );
  await pool.query(
    "UPDATE users SET city_id = $2, address = 'Butmirska cesta 2', phone = '033111111', latitude = 43.8296, longitude = 18.3103 WHERE id = $1",
    [restaurantId, sarajevo],
  );
});

afterEach(async () => {
  await cleanupUsers([STORE, RESTAURANT]);
});

// A Pending delivery order of 2 of a product with 10, sent `minutesAgo` minutes ago.
const deliveryOrder = async (minutesAgo: number) => {
  const product = await createProduct(store, { quantity: 10, discounted_price: 5 });
  await restaurant.put(`/api/cart/items/${product.id}`).send({ quantity: 2 });
  const sent = await restaurant.post("/api/orders").send({
    fulfilment_method: "DELIVERY",
    items: [{ product_id: product.id, quantity: 2, unit_price: 5 }],
  });
  expect(sent.status).toBe(201);
  const orderId = sent.body.order.id as number;
  await pool.query("UPDATE orders SET created_at = LOCALTIMESTAMP - make_interval(mins => $2) WHERE id = $1", [
    orderId,
    minutesAgo,
  ]);
  return { orderId, productId: product.id, itemId: sent.body.order.items[0].id as number };
};

// A Pending pickup order of 2 whose pickup time is `minutesAhead` from now (negative: passed).
const pickupOrder = async (minutesAhead: number) => {
  const product = await createProduct(store, { quantity: 10 });
  const itemId = await orderOne(restaurant, product.id, 2);
  const row = await pool.query<{ order_id: number }>("SELECT order_id FROM order_items WHERE id = $1", [itemId]);
  const orderId = row.rows[0]!.order_id;
  await pool.query("UPDATE orders SET pickup_at = LOCALTIMESTAMP + make_interval(mins => $2) WHERE id = $1", [
    orderId,
    minutesAhead,
  ]);
  return { orderId, productId: product.id, itemId };
};

const statusOf = async (orderId: number) =>
  (await pool.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [orderId])).rows[0]!.status;

const notificationsOf = async (orderId: number) =>
  (
    await pool.query<{ user_id: number; type: string }>(
      "SELECT user_id, type FROM notifications WHERE order_id = $1 AND type = 'ORDER_AUTO_REJECTED' ORDER BY user_id",
      [orderId],
    )
  ).rows;

describe("autoRejectOrders", () => {
  it("rejects a delivery order unanswered for 15 minutes, frees its quantity and tells both sides", async () => {
    const { orderId, productId } = await deliveryOrder(16);
    expect(await freeQuantity(pool, productId)).toBe(8);

    expect(await autoRejectOrders()).toBe(1);

    expect(await statusOf(orderId)).toBe("Rejected");
    const items = await pool.query("SELECT status FROM order_items WHERE order_id = $1", [orderId]);
    expect(items.rows.map((item) => item.status)).toEqual(["Rejected"]);
    expect(await freeQuantity(pool, productId)).toBe(10);
    const history = await pool.query(
      "SELECT from_status, to_status, source FROM order_status_history WHERE order_id = $1 AND to_status = 'Rejected'",
      [orderId],
    );
    expect(history.rows).toEqual([{ from_status: "Pending", to_status: "Rejected", source: "SYSTEM" }]);
    expect((await notificationsOf(orderId)).map((n) => n.user_id).sort()).toEqual(
      [storeId, restaurantId].sort((a, b) => a - b),
    );
    const emails = await pool.query(
      "SELECT email_queue.user_id FROM email_queue WHERE email_queue.template = 'ORDER_AUTO_REJECTED' AND email_queue.user_id = ANY($1::int[])",
      [[storeId, restaurantId]],
    );
    expect(emails.rows).toHaveLength(2);

    // A second run finds nothing.
    expect(await autoRejectOrders()).toBe(0);
    expect(await notificationsOf(orderId)).toHaveLength(2);
  });

  it("leaves a delivery order the store still has time for", async () => {
    const { orderId } = await deliveryOrder(14);
    expect(await autoRejectOrders()).toBe(0);
    expect(await statusOf(orderId)).toBe("Pending");
  });

  it("rejects a pickup order at its pickup time, not before", async () => {
    const passed = await pickupOrder(-1);
    const coming = await pickupOrder(30);

    expect(await autoRejectOrders()).toBe(1);

    expect(await statusOf(passed.orderId)).toBe("Rejected");
    expect(await statusOf(coming.orderId)).toBe("Pending");
  });

  it("leaves an accepted order alone", async () => {
    const { orderId, itemId } = await pickupOrder(30);
    const accepted = await store
      .post(`/api/orders/${orderId}/decision`)
      .send({ items: [{ item_id: itemId, action: "ACCEPT" }] });
    expect(accepted.status).toBe(200);
    await pool.query("UPDATE orders SET pickup_at = LOCALTIMESTAMP - INTERVAL '1 minute' WHERE id = $1", [orderId]);

    expect(await autoRejectOrders()).toBe(0);
    expect(await statusOf(orderId)).toBe("Confirmed");
  });
});

describe("the store's decision after the deadline", () => {
  it("is refused, and the order shows when it is rejected while Pending", async () => {
    const late = await deliveryOrder(16);
    const response = await store
      .post(`/api/orders/${late.orderId}/decision`)
      .send({ reject_order: true, reason: "QUALITY" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("This order was not answered in time and can no longer be decided.");
    expect(await statusOf(late.orderId)).toBe("Pending");

    const open = await deliveryOrder(5);
    const shown = await store.get(`/api/orders/${open.orderId}`);
    const created = new Date(shown.body.order.created_at).getTime();
    expect(new Date(shown.body.order.auto_reject_at).getTime() - created).toBe(15 * 60 * 1000);

    const pickup = await pickupOrder(30);
    const pickupShown = await restaurant.get(`/api/orders/${pickup.orderId}`);
    expect(pickupShown.body.order.auto_reject_at).toBe(pickupShown.body.order.pickup_at);
  });

  it("no longer shows a deadline once the order is decided", async () => {
    const { orderId, itemId } = await pickupOrder(30);
    await store.post(`/api/orders/${orderId}/decision`).send({ items: [{ item_id: itemId, action: "ACCEPT" }] });
    const shown = await store.get(`/api/orders/${orderId}`);
    expect(shown.body.order.auto_reject_at).toBeNull();
  });
});
