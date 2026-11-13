import pool from "../src/config/db.js";
import {
  type Agent,
  cleanupUsers,
  createProduct,
  futurePickup,
  registerAndLogin,
  reserve,
  userId,
  acceptItem,
  rejectItem,
} from "./helpers.js";

// "Sold in shop": the store records what it sold at its own till; only the free quantity drops.
const STORE = "shopsales-store@test.com";
const OTHER_STORE = "shopsales-other-store@test.com";
const RESTAURANT = "shopsales-restaurant@test.com";

let store: Agent;
let restaurant: Agent;

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
});

afterEach(async () => {
  await cleanupUsers([STORE, OTHER_STORE, RESTAURANT]);
});

const sellInShop = (productId: number, quantity: unknown, agent: Agent = store) =>
  agent.post(`/api/products/${productId}/shop-sales`).send({ quantity });

const available = async (productId: number, agent: Agent = restaurant) =>
  parseFloat((await agent.get(`/api/products/${productId}`)).body.product.available_quantity);

const productStatus = async (productId: number) =>
  (await pool.query("SELECT status FROM products WHERE id = $1", [productId])).rows[0].status;

const notificationTypes = async (email: string) =>
  (
    await pool.query(
      "SELECT notifications.type FROM notifications JOIN users ON users.id = notifications.user_id WHERE users.email = $1",
      [email],
    )
  ).rows.map((row) => row.type);

describe("recording a sale in the shop", () => {
  it("lowers the free quantity everywhere restaurants and the store see it", async () => {
    const product = await createProduct(store, { quantity: 20 });
    const response = await sellInShop(product.id, 5);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ message: "Sale in the shop recorded.", available_quantity: 15, status: "Available" });
    expect(response.body.sale).toMatchObject({ product_id: product.id });
    expect(parseFloat(response.body.sale.quantity)).toBe(5);

    // Product page: the restaurant sees only the lower availability, the store also what it sold.
    const forRestaurant = (await restaurant.get(`/api/products/${product.id}`)).body.product;
    expect(parseFloat(forRestaurant.available_quantity)).toBe(15);
    expect(forRestaurant).not.toHaveProperty("sold_in_shop");
    const forStore = (await store.get(`/api/products/${product.id}`)).body.product;
    expect(parseFloat(forStore.sold_in_shop)).toBe(5);

    // Marketplace and my products.
    const listed = (await restaurant.get(`/api/products?store_id=${await userId(STORE)}`)).body.products;
    expect(parseFloat(listed.find((row: { id: number }) => row.id === product.id).available_quantity)).toBe(15);
    const mine = (await store.get("/api/products/mine")).body.products.find((row: { id: number }) => row.id === product.id);
    expect(parseFloat(mine.available_quantity)).toBe(15);
    expect(parseFloat(mine.sold_in_shop)).toBe(5);
  });

  it("takes the free quantity as a sale, never what accepted orders hold", async () => {
    const product = await createProduct(store, { quantity: 10 });
    const accepted = await reserve(restaurant, product.id, 3);
    await acceptItem(store, accepted);
    await reserve(restaurant, product.id, 4);
    // 3 kg are promised to an accepted order; free 3 + 4 in a pending order can be sold.
    const tooMuch = await sellInShop(product.id, 7.5);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error).toBe("You can record at most 7 kg: the rest is in accepted orders.");
    const sale = await sellInShop(product.id, 3);
    expect(sale.status).toBe(201);
    expect(sale.body).toMatchObject({ recorded: 3, shop_shortage: 0, available_quantity: 0 });
    // The pending order still holds 4, so the product stays Available with nothing free.
    expect(await available(product.id)).toBe(0);
    expect(await productStatus(product.id)).toBe("Available");
    const marketplace = (await restaurant.get("/api/products?radius=all")).body.products;
    expect(marketplace.map((row: { id: number }) => row.id)).not.toContain(product.id);
    // Nor can a new order take what the shop sold.
    const ordering = await restaurant
      .post("/api/orders")
      .send({ pickup_at: futurePickup(), items: [{ product_id: product.id, quantity: 1, unit_price: 5 }] });
    expect(ordering.status).toBe(409);
    expect(ordering.body.lines).toMatchObject([{ product_id: product.id, kind: "NOT_SENT_SOLD_OUT" }]);
  });

  it("frees the pending quantity again when the store rejects, and sells out when it accepts", async () => {
    const product = await createProduct(store, { quantity: 10 });
    const rejected = await reserve(restaurant, product.id, 4);
    await sellInShop(product.id, 6);
    await rejectItem(store, rejected);
    expect(await available(product.id)).toBe(4);

    const accepted = await reserve(restaurant, product.id, 4);
    expect((await acceptItem(store, accepted)).status).toBe(200);
    // 4 accepted + 6 sold in the shop cover the 10.
    expect(await productStatus(product.id)).toBe("Sold");
    expect(await notificationTypes(STORE)).toContain("PRODUCT_SOLD_OUT");
  });

  it("sells the product out when the shop takes everything, without notifying the store", async () => {
    const product = await createProduct(store, { quantity: 3 });
    const response = await sellInShop(product.id, 3);
    expect(response.body).toMatchObject({ available_quantity: 0, status: "Sold" });
    expect(await productStatus(product.id)).toBe("Sold");
    expect(await notificationTypes(STORE)).not.toContain("PRODUCT_SOLD_OUT");
    // Not an app sale: the store profile's products sold leaves it out.
    const details = await restaurant.get(`/api/users/stores/${await userId(STORE)}`);
    expect(Number(details.body.stats.sold_articles)).toBe(0);
  });

  it("gives no credit back and writes nothing to the ledger", async () => {
    const product = await createProduct(store, { quantity: 10 });
    const before = await pool.query("SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1", [await userId(STORE)]);
    await sellInShop(product.id, 10);
    const after = await pool.query("SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1", [await userId(STORE)]);
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("moves only the free quantity to donations", async () => {
    const product = await createProduct(store, { quantity: 10 });
    await sellInShop(product.id, 7);
    const tooMuch = await store.post(`/api/donations/from-product/${product.id}`).send({ donation_type: "FREE", quantity: 4 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error).toBe("Not enough product available.");
    const rest = await store.post(`/api/donations/from-product/${product.id}`).send({ donation_type: "FREE" });
    expect(rest.status).toBe(201);
    expect(parseFloat(rest.body.donation.quantity)).toBe(3);
  });

  it("returning a fully moved donation counts the shop sales", async () => {
    const product = await createProduct(store, { quantity: 10 });
    await sellInShop(product.id, 7);
    // The 3 kg still free go to donations: nothing is reserved, so the product leaves the offer.
    const moved = await store.post(`/api/donations/from-product/${product.id}`).send({ donation_type: "FREE" });
    expect(moved.status).toBe(201);
    expect(await productStatus(product.id)).toBe("Removed");

    const returned = await store.post(`/api/donations/${moved.body.donation.id}/return-to-product`);
    expect(returned.status).toBe(200);
    // Rebuilt as donation 3 + reservations 0 + sold in shop 7, so exactly the 3 kg are free again.
    expect(parseFloat(returned.body.product.quantity)).toBe(10);
    expect(returned.body.product.status).toBe("Available");
    expect(await available(product.id)).toBe(3);
    const marketplace = (await restaurant.get(`/api/products?store_id=${await userId(STORE)}`)).body.products;
    expect(parseFloat(marketplace.find((row: { id: number }) => row.id === product.id).available_quantity)).toBe(3);
  });

  it("validates the amount, the owner and the product", async () => {
    const product = await createProduct(store, { quantity: 10 });
    for (const quantity of [0, -1, "abc", undefined]) {
      const response = await sellInShop(product.id, quantity);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Quantity must be greater than zero.");
    }
    const other = await registerAndLogin(OTHER_STORE, "STORE");
    const notOwner = await sellInShop(product.id, 1, other);
    expect(notOwner.status).toBe(403);
    expect(notOwner.body.error).toBe("You are not allowed to record a sale for this product.");
    expect((await sellInShop(product.id, 1, restaurant)).status).toBe(403);
    expect((await sellInShop(999999, 1)).status).toBe(404);
    expect((await sellInShop(Number.NaN, 1)).status).toBe(404);

    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [product.id]);
    const expired = await sellInShop(product.id, 1);
    expect(expired.status).toBe(400);
    expect(expired.body.error).toBe("Only available products can be recorded as sold in the shop.");
  });
});

// The till sold food that Pending orders hold: 10 kg on offer, an order of 6 kg, 8 kg sold at the
// till, so 2 kg is really left.
describe("selling more than is free (the shop's shortage)", () => {
  const send = (productId: number, quantity: number, acceptPartial = true) =>
    restaurant.post("/api/orders").send({
      pickup_at: futurePickup(),
      accept_partial: acceptPartial,
      items: [{ product_id: productId, quantity, unit_price: 5 }],
    });
  const shortageOf = async (productId: number) =>
    parseFloat((await pool.query("SELECT shop_shortage FROM products WHERE id = $1", [productId])).rows[0].shop_shortage);
  const shopSold = async (productId: number) =>
    parseFloat(
      (await pool.query("SELECT COALESCE(SUM(quantity), 0) AS sold FROM product_shop_sales WHERE product_id = $1", [productId]))
        .rows[0].sold,
    );
  const decide = (orderId: number, items: Record<string, unknown>[]) =>
    store.post(`/api/orders/${orderId}/decision`).send({ items });

  it("records the free part, keeps the rest as a shortage and lists the pending orders", async () => {
    const product = await createProduct(store, { name: "Jabuke", quantity: 10 });
    const order = (await send(product.id, 6)).body.order;
    const sale = await sellInShop(product.id, 8);
    expect(sale.status).toBe(201);
    expect(sale.body).toMatchObject({ recorded: 4, shop_shortage: 4, available_quantity: 0, status: "Available" });
    expect(sale.body.pending_orders).toEqual([
      { id: order.id, code: order.code, restaurant_name: expect.any(String), quantity: "6" },
    ]);
    expect(await shopSold(product.id)).toBe(4);
    // Only the store sees the shortage.
    const own = (await store.get(`/api/products/${product.id}`)).body.product;
    expect(own).toMatchObject({ shop_shortage: "4", pending_quantity: "6" });
    const theirs = (await restaurant.get(`/api/products/${product.id}`)).body.product;
    expect(theirs.shop_shortage).toBeUndefined();
    const details = (await restaurant.get(`/api/orders/${order.id}`)).body.order;
    expect(details.items[0].shop_shortage).toBeUndefined();
    expect((await store.get(`/api/orders/${order.id}`)).body.order.items[0].shop_shortage).toBe("4");
  });

  it("does not let the store accept more than is left, and turns the freed part into a shop sale", async () => {
    const product = await createProduct(store, { name: "Jabuke", quantity: 10 });
    const order = (await send(product.id, 6)).body.order;
    await sellInShop(product.id, 8);
    const item = order.items[0].id;

    const all = await decide(order.id, [{ item_id: item, action: "ACCEPT" }]);
    expect(all.status).toBe(400);
    expect(all.body.error).toBe(
      "Not enough in stock for Jabuke: at most 2 kg can be accepted after the sale in your shop. Accept less or reject it.",
    );
    const tooMuch = await decide(order.id, [{ item_id: item, action: "ACCEPT_LESS", quantity: 3, reason: "NOT_ENOUGH_STOCK" }]);
    expect(tooMuch.status).toBe(400);

    const less = await decide(order.id, [{ item_id: item, action: "ACCEPT_LESS", quantity: 2, reason: "NOT_ENOUGH_STOCK" }]);
    expect(less.status).toBe(200);
    // 2 accepted + 8 sold in the shop: nothing is offered again, and the product is sold out.
    expect(await shortageOf(product.id)).toBe(0);
    expect(await shopSold(product.id)).toBe(8);
    expect(await available(product.id, store)).toBe(0);
    expect(await productStatus(product.id)).toBe("Sold");
    const fromOrder = await pool.query("SELECT quantity, order_id FROM product_shop_sales WHERE product_id = $1 AND order_id IS NOT NULL", [product.id]);
    expect(fromOrder.rows).toEqual([{ quantity: "4", order_id: order.id }]);
  });

  it("requires rejecting an item the shop sold entirely, and the whole order without partial fulfilment", async () => {
    const product = await createProduct(store, { name: "Jabuke", quantity: 10 });
    const partial = (await send(product.id, 3)).body.order;
    const whole = (await send(product.id, 3, false)).body.order;
    await sellInShop(product.id, 7);
    expect(await shortageOf(product.id)).toBe(3);

    const rejectedItem = await decide(partial.id, [{ item_id: partial.items[0].id, action: "ACCEPT" }]);
    expect(rejectedItem.body.error).toBe("Not enough in stock for Jabuke: it was sold in your shop and must be rejected.");
    const rejectedOrder = await decide(whole.id, [{ item_id: whole.items[0].id, action: "ACCEPT" }]);
    expect(rejectedOrder.body.error).toBe("This order must be rejected: Jabuke was sold in your shop (only 0 kg left).");

    // Rejecting one order covers the shortage; the other can then be accepted in full.
    const reject = await store.post(`/api/orders/${whole.id}/decision`).send({ reject_order: true, reason: "NOT_ENOUGH_STOCK" });
    expect(reject.status).toBe(200);
    expect(await shortageOf(product.id)).toBe(0);
    expect((await decide(partial.id, [{ item_id: partial.items[0].id, action: "ACCEPT" }])).status).toBe(200);
    expect(await available(product.id, store)).toBe(0);
  });

  it("covers the shortage when the restaurant cancels the order", async () => {
    const product = await createProduct(store, { quantity: 10 });
    const order = (await send(product.id, 6)).body.order;
    await sellInShop(product.id, 8);
    expect((await restaurant.post(`/api/orders/${order.id}/cancel`)).status).toBe(200);
    expect(await shortageOf(product.id)).toBe(0);
    expect(await shopSold(product.id)).toBe(8);
    expect(await available(product.id, store)).toBe(2);
  });
});

describe("listing the sales in the shop", () => {
  it("lists the product's entries newest first, to its store only", async () => {
    const product = await createProduct(store, { quantity: 10 });
    await sellInShop(product.id, 2);
    await sellInShop(product.id, 3);
    const response = await store.get(`/api/products/${product.id}/shop-sales`);
    expect(response.status).toBe(200);
    expect(response.body.sales.map((sale: { quantity: string }) => parseFloat(sale.quantity))).toEqual([3, 2]);
    expect(response.body.sales[0]).toMatchObject({ created_by_email: STORE });

    const other = await registerAndLogin(OTHER_STORE, "STORE");
    const forbidden = await other.get(`/api/products/${product.id}/shop-sales`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toBe("You are not allowed to see the sales of this product.");
    expect((await restaurant.get(`/api/products/${product.id}/shop-sales`)).status).toBe(403);
    expect((await store.get("/api/products/999999/shop-sales")).status).toBe(404);
  });
});
