import pool from "../src/config/db.js";
import { getBalance } from "../src/services/creditService.js";
import { expireProducts } from "../src/jobs/expireProducts.js";
import {
  type Agent,
  cleanupUsers,
  createDonation,
  createProduct,
  futureDate,
  insertUser,
  login,
  productPayload,
  registerAndLogin,
  reserve,
  userId,
  insertOrderItem,
  orderOf,
  acceptItem,
  rejectItem,
  itemOrderAction,
} from "./helpers.js";

const STORE = "creditflows-store@test.com";
const RESTAURANT = "creditflows-restaurant@test.com";
const ADMIN = "creditflows-admin@test.com";

// A day later on the server clock (only Date is faked, so the database keeps the real time).
// 25 hours always reach the next London day, also on a 25-hour DST day.
const moveToTomorrow = () => {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 25 * 60 * 60 * 1000 });
};

let store: Agent;
let restaurant: Agent;
let storeId: number;
let restaurantId: number;

const available = async (id: number) => (await getBalance(pool, id)).available;

// Ledger rows of one type for an entity, to check refunds independently of the month.
const ledger = async (type: string, entityId: number) =>
  (
    await pool.query(
      "SELECT * FROM credit_transactions WHERE type = $1 AND related_entity_id = $2 ORDER BY id",
      [type, entityId],
    )
  ).rows;

// Sets the credits of the current month to exactly `credits` with an adjustment.
const setCredits = async (id: number, credits: number) => {
  const difference = credits - (await available(id));
  if (difference !== 0) {
    await pool.query(
      `INSERT INTO credit_transactions (user_id, subscription_id, period_month, amount, type, reason, actor)
       SELECT $1, subscriptions.id, subscriptions.period_month, $2, 'ADMIN_ADJUSTMENT', 'Test', 'SYSTEM'
       FROM subscriptions WHERE subscriptions.user_id = $1 ORDER BY subscriptions.period_month DESC LIMIT 1`,
      [id, difference],
    );
  }
};

beforeEach(async () => {
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  storeId = await userId(STORE);
  restaurantId = await userId(RESTAURANT);
});

afterEach(async () => {
  vi.useRealTimers();
  await cleanupUsers([STORE, RESTAURANT, ADMIN]);
});

describe("store: 1 credit per published product", () => {
  it("charges 1 credit with the product's category", async () => {
    const before = await available(storeId);
    const product = await createProduct(store, { category: "Fish" });
    expect(await available(storeId)).toBe(before - 1);
    expect(await ledger("PRODUCT_CHARGE", product.id)).toMatchObject([{ amount: -1, category: "Fish" }]);
  });

  it("refuses a product at 0 credits with a 402 and creates nothing", async () => {
    await setCredits(storeId, 0);
    const response = await store.post("/api/products").send(productPayload({ name: "No credits" }));
    expect(response.status).toBe(402);
    expect(response.body).toEqual({
      error: "Not enough credits.",
      code: "INSUFFICIENT_CREDITS",
      hasActiveSubscription: true,
      actionUrl: "/my-profile#topup",
    });
    const products = await pool.query("SELECT id FROM products WHERE store_id = $1", [storeId]);
    expect(products.rows).toHaveLength(0);
  });

  it("refuses a product without a subscription, pointing to the subscription", async () => {
    await cleanupUsers([STORE]);
    await insertUser(STORE, "STORE", "Test Business", null);
    const noSubscription = await login(STORE);
    const response = await noSubscription.post("/api/products").send(productPayload());
    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({ hasActiveSubscription: false, actionUrl: "/my-profile#subscription" });
  });

  it("charges a CSV import per product, all or nothing", async () => {
    const date = futureDate(5);
    const file = Buffer.from(
      ["name,description,category,original_price,discounted_price,quantity,unit,expiry_date",
        `Hljeb,,Bakery,2,1,20,kom,${date}`,
        `Mlijeko,,Dairy,2,1,20,l,${date}`,
        `Sir,,Dairy,2,1,20,kg,${date}`].join("\n"),
    );
    const upload = () => store.post("/api/products/import").attach("file", file, { filename: "p.csv", contentType: "text/csv" });

    await setCredits(storeId, 2);
    const refused = await upload();
    expect(refused.status).toBe(402);
    expect((await pool.query("SELECT id FROM products WHERE store_id = $1", [storeId])).rows).toHaveLength(0);
    expect(await available(storeId)).toBe(2);

    await setCredits(storeId, 3);
    const imported = await upload();
    expect(imported.status).toBe(201);
    expect(await available(storeId)).toBe(0);
  });

  it("refunds a deleted product on the same day", async () => {
    const before = await available(storeId);
    const product = await createProduct(store);
    const response = await store.delete(`/api/products/${product.id}`);
    expect(response.status).toBe(200);
    expect(response.body.creditRefunded).toBe(true);
    expect(await available(storeId)).toBe(before);
  });

  it("keeps the credit when the product is deleted after the day boundary", async () => {
    const product = await createProduct(store);
    moveToTomorrow();
    const response = await store.delete(`/api/products/${product.id}`);
    expect(response.status).toBe(200);
    expect(response.body.creditRefunded).toBe(false);
    expect(await ledger("PRODUCT_REFUND", product.id)).toHaveLength(0);
  });

  it("keeps the credit when a deleted product had a picked-up reservation", async () => {
    const product = await createProduct(store);
    await insertOrderItem({ productId: product.id, restaurantId, quantity: 2, status: "Completed", pickupAt: "NOW()" });
    const response = await store.delete(`/api/products/${product.id}`);
    expect(response.status).toBe(200);
    expect(response.body.creditRefunded).toBe(false);
  });

  it("refunds a product moved to donations completely on the same day, but not a partial move", async () => {
    const whole = await createProduct(store);
    const part = await createProduct(store);
    const before = await available(storeId);

    const moved = await store.post(`/api/donations/from-product/${whole.id}`).send({ donation_type: "FREE" });
    expect(moved.status).toBe(201);
    expect(moved.body.creditRefunded).toBe(true);
    const partial = await store.post(`/api/donations/from-product/${part.id}`).send({ donation_type: "FREE", quantity: 4 });
    expect(partial.body.creditRefunded).toBe(false);
    expect(await available(storeId)).toBe(before + 1);
  });

  it("does not refund a complete move to donations after the day boundary", async () => {
    const product = await createProduct(store);
    moveToTomorrow();
    const moved = await store.post(`/api/donations/from-product/${product.id}`).send({ donation_type: "FREE" });
    expect(moved.status).toBe(201);
    expect(moved.body.creditRefunded).toBe(false);
  });

  it("charges again when a fully moved product returns to the offer, and blocks at 0 credits", async () => {
    const product = await createProduct(store);
    const donation = (await store.post(`/api/donations/from-product/${product.id}`).send({ donation_type: "FREE" })).body
      .donation;

    await setCredits(storeId, 0);
    const refused = await store.post(`/api/donations/${donation.id}/return-to-product`);
    expect(refused.status).toBe(402);
    const unchanged = await pool.query("SELECT status FROM products WHERE id = $1", [product.id]);
    expect(unchanged.rows[0].status).toBe("Removed");

    await setCredits(storeId, 1);
    const returned = await store.post(`/api/donations/${donation.id}/return-to-product`);
    expect(returned.status).toBe(200);
    expect(returned.body.product.status).toBe("Available");
    expect(await available(storeId)).toBe(0);
    expect(await ledger("PRODUCT_CHARGE", product.id)).toHaveLength(2);
  });

  it("does not charge again when a product moved after the charge day returns to the offer", async () => {
    const product = await createProduct(store);
    moveToTomorrow();
    const moved = await store.post(`/api/donations/from-product/${product.id}`).send({ donation_type: "FREE" });
    expect(moved.body.creditRefunded).toBe(false);

    await setCredits(storeId, 0);
    const returned = await store.post(`/api/donations/${moved.body.donation.id}/return-to-product`);
    expect(returned.status).toBe(200);
    expect(returned.body.product.status).toBe("Available");
    expect(await ledger("PRODUCT_CHARGE", product.id)).toHaveLength(1);
  });

  it("does not charge when quantity returns to a product that stayed on offer", async () => {
    const product = await createProduct(store);
    const donation = (
      await store.post(`/api/donations/from-product/${product.id}`).send({ donation_type: "FREE", quantity: 3 })
    ).body.donation;
    const before = await available(storeId);
    const returned = await store.post(`/api/donations/${donation.id}/return-to-product`);
    expect(returned.status).toBe(200);
    expect(await available(storeId)).toBe(before);
  });

  it("never charges for donations", async () => {
    const before = await available(storeId);
    await createDonation(store);
    await createDonation(restaurant, { category: "Meals", unit: "portion" });
    expect(await available(storeId)).toBe(before);
  });

  it("locks quantity and expiry date after publishing; other fields stay editable", async () => {
    const product = await createProduct(store);
    const quantity = await store.put(`/api/products/${product.id}`).send(productPayload({ quantity: 11 }));
    expect(quantity.status).toBe(400);
    expect(quantity.body.error).toBe("Quantity and expiry date cannot be changed after publishing.");
    const expiry = await store.put(`/api/products/${product.id}`).send(productPayload({ expiry_date: futureDate(10) }));
    expect(expiry.status).toBe(400);

    const other = await store
      .put(`/api/products/${product.id}`)
      .send(productPayload({ name: "Renamed", description: "New text", original_price: 12, discounted_price: 6 }));
    expect(other.status).toBe(200);
    expect(other.body.product).toMatchObject({ name: "Renamed", expiry_date: futureDate() });
    expect(parseFloat(other.body.product.quantity)).toBe(10);
  });
});

describe("restaurant: orders cost no credits", () => {
  let productId: number;

  // Every ledger row of the restaurant (it has no subscription, see insertUser).
  const restaurantLedger = async () =>
    (await pool.query("SELECT type FROM credit_transactions WHERE user_id = $1", [restaurantId])).rows;

  beforeEach(async () => {
    productId = (await createProduct(store, { category: "Dairy" })).id;
  });

  it("orders without a subscription or credits, and nothing is charged", async () => {
    await reserve(restaurant, productId, 2);
    expect(await restaurantLedger()).toEqual([]);
  });

  it("writes nothing to the ledger when an order is cancelled, rejected, missed or expires", async () => {
    const cancelled = await reserve(restaurant, productId, 1);
    expect((await itemOrderAction(restaurant, cancelled, "cancel")).status).toBe(200);
    const rejected = await reserve(restaurant, productId, 1);
    expect((await rejectItem(store, rejected)).status).toBe(200);
    const missed = await reserve(restaurant, productId, 1);
    await acceptItem(store, missed);
    await pool.query("UPDATE orders SET pickup_at = NOW() - INTERVAL '2 days' WHERE id = $1", [await orderOf(missed)]);
    await pool.query("UPDATE reservations SET pickup_date = NOW() - INTERVAL '2 days' WHERE id = $1", [missed]);
    expect((await itemOrderAction(store, missed, "cancel-overdue")).status).toBe(200);
    await reserve(restaurant, productId, 1);
    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [productId]);
    await expireProducts();
    expect(await restaurantLedger()).toEqual([]);
  });

  describe("admin cancellations", () => {
    let admin: Agent;

    beforeEach(async () => {
      admin = await registerAndLogin(ADMIN, "ADMIN");
    });

    it("cancels without any refund, and keeps the store's credit when it removes a product", async () => {
      const accepted = await reserve(restaurant, productId, 2);
      await acceptItem(store, accepted);
      expect((await admin.post(`/api/admin/orders/${await orderOf(accepted)}/cancel`).send({ reason: "Dispute" })).status).toBe(200);
      await reserve(restaurant, productId, 2);
      expect((await admin.delete(`/api/admin/products/${productId}`).send({ reason: "Rules" })).status).toBe(200);
      expect(await ledger("PRODUCT_REFUND", productId)).toHaveLength(0);
      const other = (await createProduct(store)).id;
      await reserve(restaurant, other, 1);
      expect((await admin.post(`/api/admin/users/${storeId}/block`).send({ reason: "Fraud" })).status).toBe(200);
      expect(await restaurantLedger()).toEqual([]);
    });
  });
});
