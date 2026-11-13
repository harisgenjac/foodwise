import pool from "../src/config/db.js";
import { expireProducts } from "../src/jobs/expireProducts.js";
import {
  type Agent,
  type Product,
  cleanupUsers,
  createProduct,
  futurePickup,
  registerAndLogin,
  userId,
} from "./helpers.js";

// The restaurant's cart (docs/orders-design.md, section 4): one store, no stock held, live flags,
// and what sending an order and the expiry job do with its lines.
const STORE = "cart-store@test.com";
const OTHER_STORE = "cart-other-store@test.com";
const RESTAURANT = "cart-restaurant@test.com";

let store: Agent;
let restaurant: Agent;

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
});

afterEach(async () => {
  await cleanupUsers([STORE, OTHER_STORE, RESTAURANT]);
});

const put = (product: { id: number }, quantity: number | string, extra: Record<string, unknown> = {}) =>
  restaurant.put(`/api/cart/items/${product.id}`).send({ quantity, ...extra });

const cart = async () => (await restaurant.get("/api/cart")).body.cart;

const lineOf = async (product: { id: number }) =>
  (await cart()).items.find((line: { product_id: number }) => line.product_id === product.id);

const setPrice = (product: { id: number }, price: number) =>
  pool.query("UPDATE products SET discounted_price = $2 WHERE id = $1", [product.id, price]);

// products.updated_at is always set by its trigger, so moving it back needs the trigger off.
const backdateProduct = async (product: { id: number }, days: number) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE products DISABLE TRIGGER set_products_updated_at");
    await client.query(`UPDATE products SET updated_at = LOCALTIMESTAMP - make_interval(days => $2) WHERE id = $1`, [product.id, days]);
    await client.query("ALTER TABLE products ENABLE TRIGGER set_products_updated_at");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

describe("/api/cart", () => {
  it("is for restaurants only", async () => {
    const product = await createProduct(store);
    expect((await store.get("/api/cart")).status).toBe(403);
    expect((await store.put(`/api/cart/items/${product.id}`).send({ quantity: 1 })).status).toBe(403);
  });

  it("adds a product, sets its quantity again and answers the whole cart with live data", async () => {
    const chicken = await createProduct(store, { name: "Piletina", quantity: 20, discounted_price: 3.5 });
    const bread = await createProduct(store, { name: "Hljeb", quantity: 10, unit: "kom", discounted_price: 1.2 });

    const empty = await cart();
    expect(empty).toMatchObject({ store: null, items: [], totals: { lines: 0, total: "0.00" }, pending_orders: 0, max_pending_orders: 10 });

    const added = await put(chicken, 5);
    expect(added.status).toBe(200);
    expect(added.body.message).toBe("Cart updated.");
    await put(bread, 2);
    const updated = await put(chicken, 8);
    expect(updated.body.cart.items).toHaveLength(2);

    const current = await cart();
    expect(current.store).toEqual({ id: chicken.store_id, business_name: expect.any(String) });
    expect(current.items.map((line: { name: string; quantity: string }) => [line.name, Number(line.quantity)])).toEqual([
      ["Piletina", 8],
      ["Hljeb", 2],
    ]);
    expect(current.items[0]).toMatchObject({
      unit_price_seen: "3.5",
      discounted_price: "3.5",
      available_quantity: "20",
      flags: { unavailable: false, unavailable_reason: null, quantity_exceeds: false, price_lowered: false, price_raised: false },
    });
    expect(current.totals).toEqual({ lines: 2, total: "30.40" });
    expect((await restaurant.get("/api/cart/count")).body.count).toBe(2);

    // A cart line holds no stock.
    const product = await restaurant.get(`/api/products/${chicken.id}`);
    expect(parseFloat(product.body.product.available_quantity)).toBe(20);
  });

  it("validates the quantity and the product", async () => {
    const product = await createProduct(store, { quantity: 10 });
    const cases: [number | string, Record<string, unknown>, number, string][] = [
      [0, {}, 400, "Quantity must be greater than zero."],
      ["abc", {}, 400, "Quantity must be greater than zero."],
      [11, {}, 400, "Not enough product available."],
      [1, { replace: "yes" }, 400, "Invalid request format."],
      [1, { accept_price: 1 }, 400, "Invalid request format."],
    ];
    for (const [quantity, extra, status, error] of cases) {
      const response = await put(product, quantity, extra);
      expect([response.status, response.body.error]).toEqual([status, error]);
    }
    const missing = await restaurant.put("/api/cart/items/999999").send({ quantity: 1 });
    expect([missing.status, missing.body.error]).toEqual([404, "Product not found."]);
    const badId = await restaurant.put("/api/cart/items/abc").send({ quantity: 1 });
    expect(badId.status).toBe(404);

    await store.delete(`/api/products/${product.id}`);
    const removed = await put(product, 1);
    expect([removed.status, removed.body.error]).toEqual([400, "This product is no longer available."]);
    expect((await cart()).items).toEqual([]);
  });

  it("keeps one store per cart: another store's product is a 409 until it replaces the cart", async () => {
    const other = await registerAndLogin(OTHER_STORE, "STORE");
    await pool.query("UPDATE users SET business_name = 'Druga prodavnica' WHERE email = $1", [OTHER_STORE]);
    const mine = await createProduct(store);
    const theirs = await createProduct(other);
    await put(mine, 1);

    const refused = await put(theirs, 2);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "CART_OTHER_STORE", store_name: expect.any(String) });
    expect((await cart()).items.map((line: { product_id: number }) => line.product_id)).toEqual([mine.id]);

    const replaced = await put(theirs, 2, { replace: true });
    expect(replaced.status).toBe(200);
    expect(replaced.body.cart.items.map((line: { product_id: number }) => line.product_id)).toEqual([theirs.id]);
    expect(replaced.body.cart.store.business_name).toBe("Druga prodavnica");
  });

  it("holds at most 30 lines", async () => {
    const products: Product[] = [];
    for (let i = 0; i < 31; i++) products.push(await createProduct(store, { name: `Proizvod ${i}` }));
    const restaurantId = await userId(RESTAURANT);
    for (const product of products.slice(0, 30)) {
      await pool.query("INSERT INTO cart_items (restaurant_id, product_id, quantity, unit_price_seen) VALUES ($1, $2, 1, 5)", [
        restaurantId,
        product.id,
      ]);
    }
    const refused = await put(products[30]!, 1);
    expect([refused.status, refused.body.error]).toEqual([400, "The cart can hold at most 30 products."]);
    // Changing a line already in the cart is still allowed.
    expect((await put(products[0]!, 2)).status).toBe(200);
  });

  it("flags lines whose offer changed: less stock, a lower or higher price, and a new price accepted", async () => {
    const chicken = await createProduct(store, { name: "Piletina", quantity: 20, discounted_price: 5 });
    const bread = await createProduct(store, { name: "Hljeb", quantity: 10, discounted_price: 2 });
    const milk = await createProduct(store, { name: "Mlijeko", quantity: 10, discounted_price: 3 });
    await put(chicken, 15);
    await put(bread, 2);
    await put(milk, 2);

    await store.post(`/api/products/${chicken.id}/shop-sales`).send({ quantity: 8 });
    await setPrice(bread, 1.5);
    await setPrice(milk, 4);

    const current = await cart();
    const [chickenLine, breadLine, milkLine] = current.items;
    expect(chickenLine).toMatchObject({ available_quantity: "12", flags: { quantity_exceeds: true, unavailable: false } });
    expect(breadLine).toMatchObject({ unit_price_seen: "2", discounted_price: "1.5", flags: { price_lowered: true, price_raised: false } });
    expect(milkLine).toMatchObject({ unit_price_seen: "3", discounted_price: "4", flags: { price_raised: true } });
    // The total counts what would be sent now: 12 kg of chicken and the cheaper bread; the milk waits.
    expect(current.totals.total).toBe("63.00");

    // Changing the quantity keeps the old price; accepting the new one updates it.
    await put(milk, 3);
    expect((await lineOf(milk)).flags.price_raised).toBe(true);
    await put(milk, 3, { accept_price: true });
    expect(await lineOf(milk)).toMatchObject({ unit_price_seen: "4", flags: { price_raised: false } });
  });

  it("marks unavailable lines with their reason and removes them on request", async () => {
    const soldOut = await createProduct(store, { name: "Rasprodano", quantity: 5 });
    const expired = await createProduct(store, { name: "Isteklo" });
    const removed = await createProduct(store, { name: "Uklonjeno" });
    const fine = await createProduct(store, { name: "Dostupno" });
    for (const product of [soldOut, expired, removed, fine]) await put(product, 1);

    await store.post(`/api/products/${soldOut.id}/shop-sales`).send({ quantity: 5 });
    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [expired.id]);
    await store.delete(`/api/products/${removed.id}`);

    const reasons = (await cart()).items.map((line: { name: string; flags: { unavailable_reason: string | null } }) => [
      line.name,
      line.flags.unavailable_reason,
    ]);
    expect(reasons).toEqual([
      ["Rasprodano", "SOLD_OUT"],
      ["Isteklo", "EXPIRED"],
      ["Uklonjeno", "REMOVED"],
      ["Dostupno", null],
    ]);

    const cleared = await restaurant.delete("/api/cart/unavailable");
    expect(cleared.status).toBe(200);
    expect(cleared.body.cart.items.map((line: { name: string }) => line.name)).toEqual(["Dostupno"]);
  });

  it("marks the lines of a blocked store unavailable and brings them back when it is unblocked", async () => {
    const product = await createProduct(store);
    await put(product, 1);
    await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [STORE]);
    expect((await lineOf(product)).flags).toMatchObject({ unavailable: true, unavailable_reason: "STORE_UNAVAILABLE" });
    await pool.query("UPDATE users SET is_blocked = false WHERE email = $1", [STORE]);
    expect((await lineOf(product)).flags.unavailable).toBe(false);
  });

  it("removes one line and empties the cart", async () => {
    const first = await createProduct(store);
    const second = await createProduct(store);
    await put(first, 1);
    await put(second, 1);

    const removed = await restaurant.delete(`/api/cart/items/${first.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.cart.items).toHaveLength(1);
    const again = await restaurant.delete(`/api/cart/items/${first.id}`);
    expect([again.status, again.body.error]).toEqual([404, "This product is not in the cart."]);

    const emptied = await restaurant.delete("/api/cart");
    expect([emptied.status, emptied.body.message]).toEqual([200, "Cart emptied."]);
    expect(emptied.body.cart.items).toEqual([]);
  });

  it("counts the restaurant's pending orders", async () => {
    const product = await createProduct(store);
    await restaurant.post("/api/orders").send({ pickup_at: futurePickup(), items: [{ product_id: product.id, quantity: 1, unit_price: 5 }] });
    expect((await cart()).pending_orders).toBe(1);
  });
});

describe("sending an order from the cart", () => {
  it("removes the sent lines and keeps the lines not sent", async () => {
    const chicken = await createProduct(store, { name: "Piletina", quantity: 20, discounted_price: 5 });
    const milk = await createProduct(store, { name: "Mlijeko", quantity: 5, discounted_price: 3 });
    const cheese = await createProduct(store, { name: "Sir", quantity: 5, discounted_price: 8 });
    await put(chicken, 4);
    await put(milk, 2);
    await put(cheese, 1);
    await store.post(`/api/products/${milk.id}/shop-sales`).send({ quantity: 5 });
    await setPrice(cheese, 9);

    const response = await restaurant.post("/api/orders").send({
      pickup_at: futurePickup(),
      accept_partial: true,
      items: [
        { product_id: chicken.id, quantity: 4, unit_price: 5 },
        { product_id: milk.id, quantity: 2, unit_price: 3 },
        { product_id: cheese.id, quantity: 1, unit_price: 8 },
      ],
    });
    expect(response.status).toBe(201);
    const left = (await cart()).items.map((line: { name: string; flags: { unavailable_reason: string | null; price_raised: boolean } }) => [
      line.name,
      line.flags.unavailable_reason,
      line.flags.price_raised,
    ]);
    expect(left).toEqual([
      ["Mlijeko", "SOLD_OUT", false],
      ["Sir", null, true],
    ]);
  });

  it("leaves the cart as it was when nothing is sent", async () => {
    const product = await createProduct(store, { quantity: 5 });
    await put(product, 5);
    await store.post(`/api/products/${product.id}/shop-sales`).send({ quantity: 1 });
    const response = await restaurant.post("/api/orders").send({
      pickup_at: futurePickup(),
      accept_partial: false,
      items: [{ product_id: product.id, quantity: 5, unit_price: 5 }],
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("ORDER_NOT_SENT");
    expect(await lineOf(product)).toMatchObject({ quantity: "5", flags: { quantity_exceeds: true } });
  });
});

describe("the expiry job and the cart", () => {
  it("deletes lines of products expired or removed more than a day ago and keeps the rest", async () => {
    const expiredLongAgo = await createProduct(store, { name: "Davno isteklo" });
    const expiredYesterday = await createProduct(store, { name: "Juče isteklo" });
    const removedLongAgo = await createProduct(store, { name: "Davno uklonjeno" });
    const removedNow = await createProduct(store, { name: "Upravo uklonjeno" });
    const fine = await createProduct(store, { name: "Dostupno" });
    for (const product of [expiredLongAgo, expiredYesterday, removedLongAgo, removedNow, fine]) await put(product, 1);

    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 2 WHERE id = $1", [expiredLongAgo.id]);
    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [expiredYesterday.id]);
    await store.delete(`/api/products/${removedLongAgo.id}`);
    await store.delete(`/api/products/${removedNow.id}`);
    await backdateProduct(removedLongAgo, 2);

    await expireProducts();
    expect((await cart()).items.map((line: { name: string }) => line.name)).toEqual(["Juče isteklo", "Upravo uklonjeno", "Dostupno"]);
  });
});
