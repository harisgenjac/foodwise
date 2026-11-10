import pool from "../src/config/db.js";
import { type Agent, cleanupUsers, createProduct, futurePickup, registerAndLogin, userId } from "./helpers.js";

// The store's decision on a Pending order (docs/orders-design.md, section 6): accept, accept less
// or reject each item with a reason, or reject the whole order; shop sales from the freed amount.
const STORE = "order-decision-store@test.com";
const OTHER_STORE = "order-decision-other-store@test.com";
const RESTAURANT = "order-decision-restaurant@test.com";

let store: Agent;
let restaurant: Agent;

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
});

afterEach(async () => {
  await cleanupUsers([STORE, OTHER_STORE, RESTAURANT]);
});

interface Item {
  id: number;
  product_id: number;
}

// An order of `quantities` (one product each, 5 KM per unit), with partial fulfilment on or off.
const order = async (quantities: number[], acceptPartial = true) => {
  const products = [];
  for (const [index, quantity] of quantities.entries()) {
    products.push(await createProduct(store, { name: `Proizvod ${index + 1}`, quantity: 20 }));
    expect(quantity).toBeGreaterThan(0);
  }
  const response = await restaurant.post("/api/orders").send({
    pickup_at: futurePickup(),
    accept_partial: acceptPartial,
    items: products.map((product, index) => ({ product_id: product.id, quantity: quantities[index], unit_price: 5 })),
  });
  expect(response.status).toBe(201);
  const items: Item[] = response.body.order.items;
  return { id: response.body.order.id as number, items, products };
};

const decide = (orderId: number, body: Record<string, unknown>, agent: Agent = store) =>
  agent.post(`/api/orders/${orderId}/decision`).send(body);

const itemRows = async (orderId: number) =>
  (
    await pool.query(
      `SELECT id, status, quantity, ordered_quantity, change_reason, change_note, decided_at IS NOT NULL AS decided
       FROM reservations WHERE order_id = $1 ORDER BY id`,
      [orderId],
    )
  ).rows.map((row) => ({ ...row, quantity: Number(row.quantity), ordered_quantity: Number(row.ordered_quantity) }));

const available = async (productId: number) =>
  parseFloat((await restaurant.get(`/api/products/${productId}`)).body.product.available_quantity);

const restaurantNotification = async () => (await restaurant.get("/api/notifications")).body.notifications[0];

describe("POST /api/orders/:id/decision", () => {
  it("accepts every item", async () => {
    const { id, items } = await order([2, 3]);
    const response = await decide(id, { items: items.map((item) => ({ item_id: item.id, action: "ACCEPT" })) });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ message: "Order decision saved.", order: { status: "Confirmed" } });
    expect((await itemRows(id)).map((row) => [row.status, row.quantity, row.decided])).toEqual([
      ["Confirmed", 2, true],
      ["Confirmed", 3, true],
    ]);
    expect(await restaurantNotification()).toMatchObject({ type: "ORDER_ACCEPTED", order_id: id });
    // No item rows in the history when the items all moved together.
    const history = await pool.query("SELECT item_id, to_status, source FROM order_status_history WHERE order_id = $1 ORDER BY id", [id]);
    expect(history.rows).toEqual([
      { item_id: null, to_status: "Pending", source: "RESTAURANT" },
      { item_id: null, to_status: "Confirmed", source: "STORE" },
    ]);
  });

  it("accepts less and rejects items with reasons, records a shop sale and tells the restaurant", async () => {
    const { id, items, products } = await order([20, 5, 1]);
    const response = await decide(id, {
      items: [
        { item_id: items[0]!.id, action: "ACCEPT_LESS", quantity: 15, reason: "NOT_ENOUGH_STOCK", record_shop_sale: 5 },
        { item_id: items[1]!.id, action: "REJECT", reason: "QUALITY" },
        { item_id: items[2]!.id, action: "REJECT", reason: "OTHER", note: "  Ambalaža oštećena " },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe("Confirmed");
    expect((await itemRows(id)).map((row) => [row.status, row.quantity, row.ordered_quantity, row.change_reason, row.change_note])).toEqual([
      ["Confirmed", 15, 20, "NOT_ENOUGH_STOCK", null],
      ["Rejected", 5, 5, "QUALITY", null],
      ["Rejected", 1, 1, "OTHER", "Ambalaža oštećena"],
    ]);

    // 20 on offer: 15 accepted, 5 sold in the shop, so it is sold out; the rejected ones are free again.
    const sale = await pool.query("SELECT quantity, order_id, created_by FROM product_shop_sales WHERE product_id = $1", [
      products[0]!.id,
    ]);
    expect(sale.rows).toEqual([{ quantity: "5", order_id: id, created_by: await userId(STORE) }]);
    const status = await pool.query("SELECT status FROM products WHERE id = $1", [products[0]!.id]);
    expect(status.rows[0].status).toBe("Sold");
    expect(await available(products[1]!.id)).toBe(20);

    const notification = await restaurantNotification();
    expect(notification).toMatchObject({ type: "ORDER_PARTIALLY_ACCEPTED", order_id: id });
    const list = await restaurant.get("/api/orders/mine");
    expect(list.body.orders[0]).toMatchObject({ is_partial: true, accepted_count: 1, total: "75", ordered_total: "130" });
    // One row per item when they moved differently.
    const itemHistory = await pool.query(
      "SELECT COUNT(*) AS count FROM order_status_history WHERE order_id = $1 AND item_id IS NOT NULL",
      [id],
    );
    expect(itemHistory.rows[0].count).toBe("3");

    // The shop sale shows on the product with its order.
    const shopSales = await store.get(`/api/products/${products[0]!.id}/shop-sales`);
    expect(shopSales.body.sales[0]).toMatchObject({ order_id: id });
    expect(shopSales.body.sales[0].order_code).toMatch(/^[A-Z0-9]{4}$/);
  });

  it("rejects the whole order with a reason and shop sales", async () => {
    const { id, products } = await order([4, 2]);
    const response = await decide(id, {
      reject_order: true,
      reason: "NOT_ENOUGH_STOCK",
      shop_sales: [{ product_id: products[0]!.id, quantity: 4 }],
    });
    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe("Rejected");
    expect((await itemRows(id)).map((row) => [row.status, row.change_reason])).toEqual([
      ["Rejected", "NOT_ENOUGH_STOCK"],
      ["Rejected", "NOT_ENOUGH_STOCK"],
    ]);
    expect(await available(products[0]!.id)).toBe(16);
    expect(await available(products[1]!.id)).toBe(20);
    expect(await restaurantNotification()).toMatchObject({ type: "ORDER_REJECTED", order_id: id });
  });

  it("allows only accepting all or rejecting the order when partial fulfilment is off", async () => {
    const { id, items } = await order([2, 3], false);
    const less = await decide(id, {
      items: [
        { item_id: items[0]!.id, action: "ACCEPT_LESS", quantity: 1, reason: "QUALITY" },
        { item_id: items[1]!.id, action: "ACCEPT" },
      ],
    });
    expect(less.status).toBe(400);
    expect(less.body.error).toBe("This order must be accepted in full or rejected.");
    expect((await decide(id, { reject_order: true, reason: "QUALITY" })).body.order.status).toBe("Rejected");
  });

  it("validates the decision", async () => {
    const { id, items, products } = await order([4, 2]);
    const [first, second] = items as [Item, Item];
    const accept = { item_id: second.id, action: "ACCEPT" };
    const cases: [Record<string, unknown>, string][] = [
      [{}, "Decide every item of the order."],
      [{ items: [accept] }, "Decide every item of the order."],
      [{ items: [accept, accept] }, "Decide every item of the order."],
      [{ items: [{ item_id: 999999, action: "ACCEPT" }, accept] }, "Decide every item of the order."],
      [{ items: [{ item_id: first.id, action: "MAYBE" }, accept] }, "Decide every item of the order."],
      [{ items: [{ item_id: first.id, action: "ACCEPT_LESS", quantity: 4, reason: "QUALITY" }, accept] }, "The accepted quantity must be more than zero and less than ordered."],
      [{ items: [{ item_id: first.id, action: "ACCEPT_LESS", quantity: 0, reason: "QUALITY" }, accept] }, "The accepted quantity must be more than zero and less than ordered."],
      [{ items: [{ item_id: first.id, action: "ACCEPT_LESS", quantity: 2 }, accept] }, "Choose a reason."],
      [{ items: [{ item_id: first.id, action: "REJECT", reason: "LAZY" }, accept] }, "Choose a reason."],
      [{ items: [{ item_id: first.id, action: "REJECT", reason: "OTHER" }, accept] }, "Describe the reason (at most 300 characters)."],
      [{ items: [{ item_id: first.id, action: "REJECT", reason: "OTHER", note: "x".repeat(301) }, accept] }, "Describe the reason (at most 300 characters)."],
      [{ items: [{ item_id: first.id, action: "REJECT", reason: "QUALITY", record_shop_sale: 1 }, accept] }, "The amount sold in the shop is not valid."],
      [{ items: [{ item_id: first.id, action: "ACCEPT_LESS", quantity: 3, reason: "NOT_ENOUGH_STOCK", record_shop_sale: 2 }, accept] }, "The amount sold in the shop is not valid."],
      [{ reject_order: true }, "Choose a reason."],
      [{ reject_order: true, reason: "NOT_ENOUGH_STOCK", shop_sales: [{ product_id: products[0]!.id, quantity: 5 }] }, "The amount sold in the shop is not valid."],
      [{ reject_order: true, reason: "NOT_ENOUGH_STOCK", shop_sales: [{ product_id: 999999, quantity: 1 }] }, "The amount sold in the shop is not valid."],
    ];
    for (const [body, error] of cases) {
      const response = await decide(id, body);
      expect([response.status, response.body.error], JSON.stringify(body).slice(0, 100)).toEqual([400, error]);
    }
    expect((await itemRows(id)).every((row) => row.status === "Pending")).toBe(true);
  });

  it("refuses an expired product, a decided order, another store and the restaurant", async () => {
    const { id, items, products } = await order([1]);
    const other = await registerAndLogin(OTHER_STORE, "STORE");
    const body = { items: [{ item_id: items[0]!.id, action: "ACCEPT" }] };
    expect((await decide(id, body, other)).status).toBe(404);
    expect((await decide(id, body, restaurant)).status).toBe(403);
    expect((await decide(999999, body)).status).toBe(404);

    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [products[0]!.id]);
    const expired = await decide(id, body);
    expect(expired.body.error).toBe("An expired product cannot be accepted.");
    // Rejecting it is still allowed.
    expect((await decide(id, { reject_order: true, reason: "QUALITY" })).status).toBe(200);
    const again = await decide(id, body);
    expect(again.body.error).toBe("Only pending orders can be accepted or rejected.");
  });
});
