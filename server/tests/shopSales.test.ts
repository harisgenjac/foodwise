import pool from "../src/config/db.js";
import {
  type Agent,
  cleanupUsers,
  createProduct,
  futurePickup,
  registerAndLogin,
  reserve,
  userId,
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

  it("takes only the free quantity, never what reservations hold", async () => {
    const product = await createProduct(store, { quantity: 10 });
    await reserve(restaurant, product.id, 4);
    const tooMuch = await sellInShop(product.id, 6.5);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error).toBe("You can record at most the free quantity (6).");
    expect((await sellInShop(product.id, 6)).status).toBe(201);
    // The pending reservation still holds 4, so the product stays Available with nothing free.
    expect(await available(product.id)).toBe(0);
    expect(await productStatus(product.id)).toBe("Available");
    const marketplace = (await restaurant.get("/api/products?radius=all")).body.products;
    expect(marketplace.map((row: { id: number }) => row.id)).not.toContain(product.id);
    // Nor can a new reservation take what the shop sold.
    const reserving = await restaurant
      .post("/api/reservations")
      .send({ product_id: product.id, quantity: 1, pickup_date: futurePickup() });
    expect(reserving.status).toBe(400);
    expect(reserving.body.error).toBe("Not enough product available.");
  });

  it("frees the pending quantity again when the store rejects, and sells out when it accepts", async () => {
    const product = await createProduct(store, { quantity: 10 });
    const rejected = await reserve(restaurant, product.id, 4);
    await sellInShop(product.id, 6);
    await store.patch(`/api/reservations/${rejected}/reject`);
    expect(await available(product.id)).toBe(4);

    const accepted = await reserve(restaurant, product.id, 4);
    expect((await store.patch(`/api/reservations/${accepted}/accept`)).status).toBe(200);
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
