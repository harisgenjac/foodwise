import pool from "../src/config/db.js";
import { generateOrderCode, ORDER_CODE_ALPHABET, parseOrderCode } from "../src/services/orders/codes.js";
import { MAX_PENDING_ORDERS, PENDING_LIMIT_ERROR } from "../src/services/orders/send.js";
import { deriveOrderStatus } from "../src/services/orders/status.js";
import {
  type Agent,
  cleanupUsers,
  createProduct,
  futureDate,
  futurePickup,
  insertOrderItem,
  registerAndLogin,
  userId,
} from "./helpers.js";

// Sending orders (docs/orders-design.md, section 5), the order lists and details, and the actions
// on a whole order. The store's decision is in orderDecision.test.ts.
const STORE = "orders-store@test.com";
const OTHER_STORE = "orders-other-store@test.com";
const RESTAURANT = "orders-restaurant@test.com";
const OTHER_RESTAURANT = "orders-other-restaurant@test.com";

let store: Agent;
let restaurant: Agent;

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
});

afterEach(async () => {
  await cleanupUsers([STORE, OTHER_STORE, RESTAURANT, OTHER_RESTAURANT]);
});

interface Line {
  product_id: number;
  quantity: number;
  unit_price: number | string;
}

const send = (lines: Line[], extra: Record<string, unknown> = {}, agent: Agent = restaurant) =>
  agent.post("/api/orders").send({ pickup_at: futurePickup(), items: lines, ...extra });

const line = (product: { id: number }, quantity: number, unitPrice: number | string = 5): Line => ({
  product_id: product.id,
  quantity,
  unit_price: unitPrice,
});

const history = async (orderId: number) =>
  (
    await pool.query(
      `SELECT item_id, from_status, to_status, source, actor_id FROM order_status_history
       WHERE order_id = $1 ORDER BY id`,
      [orderId],
    )
  ).rows;

describe("POST /api/orders", () => {
  it("sends an order from one store with a code, its items, history and a notification to the store", async () => {
    const chicken = await createProduct(store, { name: "Piletina", quantity: 20, discounted_price: 3.5 });
    const bread = await createProduct(store, { name: "Hljeb", quantity: 10, unit: "kom", discounted_price: 1.2 });

    const response = await send([line(chicken, 5, "3.50"), line(bread, 2, 1.2)]);
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Order sent.");
    expect(response.body.changes).toEqual([]);
    const order = response.body.order;
    expect(order).toMatchObject({
      status: "Pending",
      fulfilment_method: "PICKUP",
      accept_partial: true,
      store_id: chicken.store_id,
      restaurant_id: await userId(RESTAURANT),
    });
    expect(order.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(order.items).toHaveLength(2);

    const items = await pool.query(
      `SELECT reservations.product_id, reservations.quantity, reservations.ordered_quantity, reservations.unit_price,
              reservations.status, products.store_id
       FROM reservations JOIN products ON products.id = reservations.product_id
       WHERE reservations.order_id = $1 ORDER BY reservations.product_id`,
      [order.id],
    );
    expect(items.rows.map((row) => [row.product_id, Number(row.quantity), Number(row.ordered_quantity), row.unit_price, row.status])).toEqual([
      [chicken.id, 5, 5, "3.5", "Pending"],
      [bread.id, 2, 2, "1.2", "Pending"],
    ]);
    // Every item belongs to the order's store.
    expect(items.rows.every((row) => row.store_id === order.store_id)).toBe(true);

    expect(await history(order.id)).toEqual([
      { item_id: null, from_status: null, to_status: "Pending", source: "RESTAURANT", actor_id: await userId(RESTAURANT) },
    ]);
    const notifications = await store.get("/api/notifications");
    expect(notifications.body.notifications[0]).toMatchObject({
      type: "ORDER_CREATED",
      order_id: order.id,
      order_code: order.code,
      order_item_count: 2,
    });

    // The stock is held at once.
    const product = await restaurant.get(`/api/products/${chicken.id}`);
    expect(parseFloat(product.body.product.available_quantity)).toBe(15);
  });

  it("validates the body", async () => {
    const product = await createProduct(store);
    const cases: [Record<string, unknown>, number, string][] = [
      [{ items: [] }, 400, "An order must have between 1 and 30 items."],
      [{ items: Array.from({ length: 31 }, () => line(product, 1)) }, 400, "An order must have between 1 and 30 items."],
      [{ items: [line(product, 1)], fulfilment_method: "DELIVERY" }, 400, "Fulfilment method is not valid."],
      [{ items: [line(product, 1)], accept_partial: "yes" }, 400, "Invalid request format."],
      [{ items: [{ product_id: "abc", quantity: 1, unit_price: 5 }] }, 404, "Product not found."],
      [{ items: [{ product_id: 999999, quantity: 1, unit_price: 5 }] }, 404, "Product not found."],
      [{ items: [line(product, 0)] }, 400, "Quantity must be greater than zero."],
      [{ items: [{ product_id: product.id, quantity: 1, unit_price: -1 }] }, 400, "Price is not valid."],
      [{ items: [line(product, 1), line(product, 2)] }, 400, "A product can appear only once in an order."],
      [{ items: [line(product, 1)], pickup_at: "tomorrow" }, 400, "Pickup date is not valid."],
      [{ items: [line(product, 1)], pickup_at: `${futureDate(-1)}T10:00` }, 400, "Pickup date must be between today and the products' expiry date."],
      [{ items: [line(product, 1)], pickup_at: `${futureDate(31)}T10:00` }, 400, "Pickup date must be between today and the products' expiry date."],
    ];
    for (const [body, status, error] of cases) {
      const response = await restaurant.post("/api/orders").send({ pickup_at: futurePickup(), ...body });
      expect([response.status, response.body.error], JSON.stringify(body).slice(0, 80)).toEqual([status, error]);
    }
    expect((await pool.query("SELECT COUNT(*) AS count FROM orders WHERE store_id = $1", [product.store_id])).rows[0].count).toBe("0");
  });

  it("refuses products of two stores, and a store sending an order", async () => {
    const other = await registerAndLogin(OTHER_STORE, "STORE");
    const mine = await createProduct(store);
    const theirs = await createProduct(other);
    const response = await send([line(mine, 1), line(theirs, 1)]);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("An order can contain products of one store only.");
    expect((await send([line(mine, 1)], {}, store)).status).toBe(403);
  });

  describe("with partial fulfilment on", () => {
    it("sends what it can: less stock reduced, a lower price applied, sold-out and dearer lines left out", async () => {
      const reduced = await createProduct(store, { name: "Piletina", quantity: 15 });
      const cheaper = await createProduct(store, { name: "Hljeb", discounted_price: 1.2 });
      const soldOut = await createProduct(store, { name: "Mlijeko", quantity: 2 });
      const dearer = await createProduct(store, { name: "Sir", discounted_price: 9 });
      await store.post(`/api/products/${soldOut.id}/shop-sales`).send({ quantity: 2 });

      const response = await send([
        line(reduced, 20),
        line(cheaper, 3, "1.50"),
        line(soldOut, 1),
        line(dearer, 1, "8.00"),
      ]);
      expect(response.status).toBe(201);
      const changes = response.body.changes;
      expect(changes).toEqual([
        { product_id: reduced.id, name: "Piletina", unit: "kg", kind: "QUANTITY_REDUCED", requested: 20, sent: 15, old_price: 5, new_price: 5 },
        { product_id: cheaper.id, name: "Hljeb", unit: "kg", kind: "PRICE_LOWERED", requested: 3, sent: 3, old_price: 1.5, new_price: 1.2 },
        { product_id: soldOut.id, name: "Mlijeko", unit: "kg", kind: "NOT_SENT_SOLD_OUT", requested: 1, sent: 0, old_price: 5, new_price: 5 },
        { product_id: dearer.id, name: "Sir", unit: "kg", kind: "NOT_SENT_PRICE_RAISED", requested: 1, sent: 0, old_price: 8, new_price: 9 },
      ]);
      const sent = response.body.order.items.map((item: { product_id: number; quantity: string; unit_price: string }) => [
        item.product_id,
        Number(item.quantity),
        item.unit_price,
      ]);
      expect(sent).toEqual([
        [reduced.id, 15, "5"],
        [cheaper.id, 3, "1.2"],
      ]);
      // The details keep the changes made at sending.
      const details = await restaurant.get(`/api/orders/${response.body.order.id}`);
      expect(details.body.order.send_changes).toEqual(changes);
    });

    it("sends nothing when no line can be sent", async () => {
      const soldOut = await createProduct(store, { quantity: 1 });
      await store.post(`/api/products/${soldOut.id}/shop-sales`).send({ quantity: 1 });
      const response = await send([line(soldOut, 1)]);
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: "The order could not be sent.",
        code: "ORDER_NOT_SENT",
        lines: [{ product_id: soldOut.id, kind: "NOT_SENT_SOLD_OUT", requested: 1, available: 0, unit_price: 5 }],
      });
    });

    it("treats an expired product, a removed one and a blocked store as sold out", async () => {
      const expired = await createProduct(store);
      const removed = await createProduct(store);
      const ok = await createProduct(store);
      await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [expired.id]);
      await pool.query("UPDATE products SET status = 'Removed' WHERE id = $1", [removed.id]);
      const response = await send([line(expired, 1), line(removed, 1), line(ok, 1)]);
      expect(response.status).toBe(201);
      expect(response.body.changes.map((change: { kind: string }) => change.kind)).toEqual([
        "NOT_SENT_SOLD_OUT",
        "NOT_SENT_SOLD_OUT",
      ]);

      await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [STORE]);
      expect((await send([line(ok, 1)])).body.lines[0].kind).toBe("NOT_SENT_SOLD_OUT");
    });
  });

  describe("with partial fulfilment off", () => {
    it("sends nothing when any line has a problem, but applies a lower price", async () => {
      const reduced = await createProduct(store, { quantity: 15 });
      const fine = await createProduct(store);
      const response = await send([line(reduced, 20), line(fine, 1)], { accept_partial: false });
      expect(response.status).toBe(409);
      expect(response.body.lines).toEqual([
        { product_id: reduced.id, kind: "QUANTITY_REDUCED", requested: 20, available: 15, unit_price: 5 },
      ]);
      expect((await pool.query("SELECT COUNT(*) AS count FROM orders WHERE store_id = $1", [fine.store_id])).rows[0].count).toBe("0");

      const cheaper = await send([line(fine, 1, 6)], { accept_partial: false });
      expect(cheaper.status).toBe(201);
      expect(cheaper.body.order.accept_partial).toBe(false);
      expect(cheaper.body.changes.map((change: { kind: string }) => change.kind)).toEqual(["PRICE_LOWERED"]);
    });
  });

  it(`refuses an order over ${MAX_PENDING_ORDERS} pending ones`, async () => {
    const product = await createProduct(store, { quantity: 100 });
    for (let i = 0; i < MAX_PENDING_ORDERS; i++) {
      await insertOrderItem({ productId: product.id, restaurantId: await userId(RESTAURANT), quantity: 1 });
    }
    const response = await send([line(product, 1)]);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe(PENDING_LIMIT_ERROR);
    expect(PENDING_LIMIT_ERROR).toBe(
      "You have too many orders waiting for an answer (10). Wait for the stores to respond or cancel one.",
    );
    // A decided order no longer counts.
    await pool.query(
      "UPDATE orders SET status = 'Confirmed' WHERE id = (SELECT MIN(id) FROM orders WHERE restaurant_id = $1)",
      [await userId(RESTAURANT)],
    );
    expect((await send([line(product, 1)])).status).toBe(201);
  });

  it("never lets two parallel orders take more than exists, or pass the pending limit together", async () => {
    const product = await createProduct(store, { quantity: 5 });
    const other = await registerAndLogin(OTHER_RESTAURANT, "RESTAURANT");
    const results = await Promise.all([
      send([line(product, 4)], { accept_partial: false }),
      send([line(product, 4)], { accept_partial: false }, other),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);

    const limited = await createProduct(store, { quantity: 100 });
    for (let i = 0; i < MAX_PENDING_ORDERS - 2; i++) {
      await insertOrderItem({ productId: limited.id, restaurantId: await userId(RESTAURANT), quantity: 1 });
    }
    // The race above may have left one Pending order of this restaurant; three more at once.
    const pendingBefore = Number(
      (await pool.query("SELECT COUNT(*) AS count FROM orders WHERE restaurant_id = $1 AND status = 'Pending'", [
        await userId(RESTAURANT),
      ])).rows[0].count,
    );
    const parallel = await Promise.all([1, 2, 3].map(() => send([line(limited, 1)])));
    const accepted = parallel.filter((result) => result.status === 201).length;
    expect(pendingBefore + accepted).toBe(MAX_PENDING_ORDERS);
    expect(parallel.filter((result) => result.status === 409).every((result) => result.body.error === PENDING_LIMIT_ERROR)).toBe(true);
  });
});

describe("order lists and details", () => {
  it("lists the restaurant's orders with totals, filters and a summary", async () => {
    const chicken = await createProduct(store, { name: "Piletina", quantity: 20 });
    const bread = await createProduct(store, { name: "Hljeb", quantity: 20 });
    const first = (await send([line(chicken, 2), line(bread, 1)])).body.order;
    const second = (await send([line(bread, 3)])).body.order;
    await restaurant.post(`/api/orders/${second.id}/cancel`);

    const list = await restaurant.get("/api/orders/mine");
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(2);
    // Status order: Pending first.
    expect(list.body.orders.map((order: { id: number }) => order.id)).toEqual([first.id, second.id]);
    expect(list.body.orders[0]).toMatchObject({
      code: first.code,
      item_count: 2,
      accepted_count: 0,
      ordered_total: "15",
      total: "15",
      is_partial: false,
      business_name: "Test Business",
    });
    expect(list.body.orders[0].items.map((item: { product_name: string }) => item.product_name)).toEqual([
      "Piletina",
      "Hljeb",
    ]);

    const byProduct = await restaurant.get("/api/orders/mine?name=pilet");
    expect(byProduct.body.orders.map((order: { id: number }) => order.id)).toEqual([first.id]);
    const active = await restaurant.get("/api/orders/mine?scope=active");
    expect(active.body.total).toBe(1);
    expect((await restaurant.get("/api/orders/mine?status=Nope")).status).toBe(400);

    const summary = await restaurant.get("/api/orders/mine/summary");
    expect(summary.body.summary).toEqual({
      total: 2,
      active: 1,
      counts: { Pending: 1, Confirmed: 0, Completed: 0, Rejected: 0, Cancelled: 1 },
    });
  });

  it("lists the store's orders, Pending first, searchable by code", async () => {
    const product = await createProduct(store, { quantity: 20 });
    const first = (await send([line(product, 1)])).body.order;
    const second = (await send([line(product, 1)])).body.order;
    const list = await store.get("/api/orders/store");
    expect(list.body.orders.map((order: { id: number }) => order.id)).toEqual([second.id, first.id]);

    const byCode = await store.get(`/api/orders/store?code=${encodeURIComponent(`#${first.code.toLowerCase()}`)}`);
    expect(byCode.body.orders.map((order: { id: number }) => order.id)).toEqual([first.id]);
    expect((await store.get("/api/orders/store?code=%23%21%21")).status).toBe(400);
    expect((await restaurant.get("/api/orders/store")).status).toBe(403);
  });

  it("shows the details only to the two parties", async () => {
    const product = await createProduct(store);
    const order = (await send([line(product, 2)])).body.order;
    for (const agent of [store, restaurant]) {
      const details = await agent.get(`/api/orders/${order.id}`);
      expect(details.status).toBe(200);
      expect(details.body.order).toMatchObject({
        id: order.id,
        code: order.code,
        store: { id: product.store_id, business_name: "Test Business" },
        restaurant: { id: await userId(RESTAURANT) },
      });
      expect(details.body.order.items).toHaveLength(1);
      expect(details.body.order.history).toHaveLength(1);
    }
    const other = await registerAndLogin(OTHER_RESTAURANT, "RESTAURANT");
    expect((await other.get(`/api/orders/${order.id}`)).status).toBe(404);
    expect((await restaurant.get("/api/orders/abc")).status).toBe(404);
  });

  it("lists pickups by order", async () => {
    const product = await createProduct(store, { quantity: 20 });
    const today = await insertOrderItem({
      productId: product.id,
      restaurantId: await userId(RESTAURANT),
      quantity: 1,
      status: "Confirmed",
      pickupAt: "CURRENT_DATE + time '10:00'",
    });
    const late = await insertOrderItem({
      productId: product.id,
      restaurantId: await userId(RESTAURANT),
      quantity: 1,
      status: "Confirmed",
      pickupAt: "CURRENT_DATE - 2 + time '10:00'",
    });
    const upcoming = await insertOrderItem({
      productId: product.id,
      restaurantId: await userId(RESTAURANT),
      quantity: 1,
      status: "Confirmed",
      pickupAt: "CURRENT_DATE + 3 + time '10:00'",
    });

    const todayList = await store.get("/api/orders/pickups?scope=today");
    expect(todayList.body.orders.map((order: { id: number }) => order.id)).toEqual([late.orderId, today.orderId]);
    expect(todayList.body.orders[0]).toMatchObject({ is_overdue: true, days_overdue: 2 });
    const upcomingList = await restaurant.get("/api/orders/pickups?scope=upcoming");
    expect(upcomingList.body.orders.map((order: { id: number }) => order.id)).toEqual([upcoming.orderId]);
    expect((await store.get("/api/orders/pickups/counts")).body.counts).toEqual({
      today: 2,
      overdue: 1,
      upcoming: 1,
      completed: 0,
    });
    expect((await store.get("/api/orders/pickups?scope=nope")).status).toBe(400);
  });

  it("no longer has the old reservation endpoints", async () => {
    for (const path of ["/api/reservations/mine", "/api/reservations/store", "/api/reservations/pickups?scope=today"]) {
      expect((await restaurant.get(path)).status).toBe(404);
    }
    expect((await restaurant.post("/api/reservations").send({})).status).toBe(404);
  });
});

describe("actions on a whole order", () => {
  it("lets the restaurant cancel a Pending order and tells the store", async () => {
    const product = await createProduct(store, { quantity: 10 });
    const order = (await send([line(product, 4)])).body.order;
    const other = await registerAndLogin(OTHER_RESTAURANT, "RESTAURANT");
    expect((await other.post(`/api/orders/${order.id}/cancel`)).status).toBe(404);

    const response = await restaurant.post(`/api/orders/${order.id}/cancel`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ message: "Order cancelled.", order: { status: "Cancelled" } });
    expect(parseFloat((await restaurant.get(`/api/products/${product.id}`)).body.product.available_quantity)).toBe(10);
    expect((await store.get("/api/notifications")).body.notifications[0]).toMatchObject({ type: "ORDER_CANCELLED" });

    const again = await restaurant.post(`/api/orders/${order.id}/cancel`);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("Only pending orders can be cancelled.");
  });

  it("marks a Confirmed order picked up and cancels a missed one", async () => {
    const product = await createProduct(store, { quantity: 4 });
    const restaurantId = await userId(RESTAURANT);
    const picked = await insertOrderItem({ productId: product.id, restaurantId, quantity: 2, status: "Confirmed" });
    const missed = await insertOrderItem({
      productId: product.id,
      restaurantId,
      quantity: 2,
      status: "Confirmed",
      pickupAt: "CURRENT_DATE - 1 + time '10:00'",
    });
    await pool.query("UPDATE products SET status = 'Sold' WHERE id = $1", [product.id]);

    expect((await store.post(`/api/orders/${missed.orderId}/complete`)).status).toBe(200);
    const notOverdue = await store.post(`/api/orders/${picked.orderId}/cancel-overdue`);
    expect(notOverdue.body.error).toBe("Only overdue pickups can be cancelled.");
    expect((await store.post(`/api/orders/${picked.orderId}/complete`)).body).toMatchObject({
      message: "Order marked as picked up.",
      order: { status: "Completed" },
    });
    const item = await pool.query("SELECT status, picked_up_at FROM reservations WHERE id = $1", [picked.itemId]);
    expect(item.rows[0].status).toBe("Completed");
    expect(item.rows[0].picked_up_at).not.toBeNull();
    const notConfirmed = await store.post(`/api/orders/${picked.orderId}/complete`);
    expect(notConfirmed.body.error).toBe("Only accepted orders can be marked as picked up.");

    const late = await insertOrderItem({
      productId: product.id,
      restaurantId,
      quantity: 2,
      status: "Confirmed",
      pickupAt: "CURRENT_DATE - 1 + time '10:00'",
    });
    const cancel = await store.post(`/api/orders/${late.orderId}/cancel-overdue`);
    expect(cancel.body).toMatchObject({ message: "Overdue order cancelled.", order: { status: "Cancelled" } });
    expect((await restaurant.get("/api/notifications")).body.notifications[0]).toMatchObject({
      type: "ORDER_PICKUP_MISSED",
      order_id: late.orderId,
    });
    expect((await restaurant.post(`/api/orders/${late.orderId}/complete`)).status).toBe(403);
  });
});

describe("order codes and statuses", () => {
  it("draws 4 characters without 0, O, 1 and I", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOrderCode();
      expect(code).toHaveLength(4);
      expect([...code].every((char) => ORDER_CODE_ALPHABET.includes(char))).toBe(true);
    }
    expect(ORDER_CODE_ALPHABET).not.toMatch(/[0O1I]/);
    expect(parseOrderCode(" #k7pm ")).toBe("K7PM");
    expect(parseOrderCode("TOOLONG")).toBeNull();
  });

  it("derives the order's status from its items", () => {
    expect(deriveOrderStatus(["Pending", "Confirmed"])).toBe("Pending");
    expect(deriveOrderStatus(["Confirmed", "Rejected"])).toBe("Confirmed");
    expect(deriveOrderStatus(["Completed", "Rejected", "Cancelled"])).toBe("Completed");
    expect(deriveOrderStatus(["Rejected", "Cancelled"])).toBe("Rejected");
    expect(deriveOrderStatus(["Cancelled", "Cancelled"])).toBe("Cancelled");
  });
});
