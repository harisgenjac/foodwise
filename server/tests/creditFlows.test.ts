import pool from "../src/config/db.js";
import { getBalance } from "../src/services/creditService.js";
import { expireProducts } from "../src/jobs/expireProducts.js";
import {
  type Agent,
  cleanupUsers,
  createDonation,
  createProduct,
  futureDate,
  futurePickup,
  insertUser,
  login,
  productPayload,
  registerAndLogin,
  reserve,
  userId,
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
    await pool.query(
      `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date, picked_up_at)
       VALUES ($1, $2, 2, 5, 'Completed', NOW(), NOW())`,
      [product.id, restaurantId],
    );
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

describe("restaurant: 1 credit per reservation", () => {
  let productId: number;

  beforeEach(async () => {
    productId = (await createProduct(store, { category: "Dairy" })).id;
  });

  it("charges 1 credit with the reserved product's category", async () => {
    const before = await available(restaurantId);
    const reservationId = (await reserve(restaurant, productId, 2)) as number;
    expect(await available(restaurantId)).toBe(before - 1);
    expect(await ledger("RESERVATION_CHARGE", reservationId)).toMatchObject([{ amount: -1, category: "Dairy" }]);
  });

  it("refuses a reservation at 0 credits and keeps the stock free", async () => {
    await setCredits(restaurantId, 0);
    const response = await restaurant
      .post("/api/reservations")
      .send({ product_id: productId, quantity: 2, pickup_date: futurePickup() });
    expect(response.status).toBe(402);
    expect(response.body.code).toBe("INSUFFICIENT_CREDITS");
    expect((await pool.query("SELECT id FROM reservations WHERE product_id = $1", [productId])).rows).toHaveLength(0);
  });

  it("refunds the restaurant's own cancel on the same day", async () => {
    const before = await available(restaurantId);
    const reservationId = await reserve(restaurant, productId, 2);
    const response = await restaurant.patch(`/api/reservations/${reservationId}/cancel`);
    expect(response.status).toBe(200);
    expect(response.body.creditRefunded).toBe(true);
    expect(await available(restaurantId)).toBe(before);
  });

  it("does not refund the restaurant's own cancel after the day boundary", async () => {
    const reservationId = await reserve(restaurant, productId, 2);
    moveToTomorrow();
    const response = await restaurant.patch(`/api/reservations/${reservationId}/cancel`);
    expect(response.body.creditRefunded).toBe(false);
    expect(await ledger("RESERVATION_REFUND", reservationId)).toHaveLength(0);
  });

  it("always refunds a reservation the store rejects, even after the day boundary", async () => {
    const reservationId = await reserve(restaurant, productId, 2);
    moveToTomorrow();
    expect((await store.patch(`/api/reservations/${reservationId}/reject`)).status).toBe(200);
    expect(await ledger("RESERVATION_REFUND", reservationId)).toMatchObject([{ amount: 1, actor: "USER" }]);
  });

  it("does not refund a missed pickup cancelled by the store", async () => {
    const reservationId = await reserve(restaurant, productId, 2);
    await store.patch(`/api/reservations/${reservationId}/accept`);
    await pool.query("UPDATE reservations SET pickup_date = NOW() - INTERVAL '2 days' WHERE id = $1", [reservationId]);
    expect((await store.patch(`/api/reservations/${reservationId}/cancel-overdue`)).status).toBe(200);
    expect(await ledger("RESERVATION_REFUND", reservationId)).toHaveLength(0);
  });

  it("refunds pending reservations cancelled by the expiry job", async () => {
    const reservationId = await reserve(restaurant, productId, 2);
    await pool.query("UPDATE products SET expiry_date = CURRENT_DATE - 1 WHERE id = $1", [productId]);
    await expireProducts();
    expect(await ledger("RESERVATION_REFUND", reservationId)).toMatchObject([{ amount: 1, actor: "SYSTEM" }]);
  });

  describe("admin cancellations", () => {
    let admin: Agent;

    beforeEach(async () => {
      admin = await registerAndLogin(ADMIN, "ADMIN");
    });

    it("refunds a reservation an admin cancels, also an accepted one", async () => {
      const reservationId = await reserve(restaurant, productId, 2);
      await store.patch(`/api/reservations/${reservationId}/accept`);
      const response = await admin.post(`/api/admin/reservations/${reservationId}/cancel`).send({ reason: "Dispute" });
      expect(response.status).toBe(200);
      expect(await ledger("RESERVATION_REFUND", reservationId)).toMatchObject([{ actor: "ADMIN" }]);
    });

    it("refunds the restaurants but not the store when an admin removes a product", async () => {
      const reservationId = await reserve(restaurant, productId, 2);
      const response = await admin.delete(`/api/admin/products/${productId}`).send({ reason: "Rules" });
      expect(response.status).toBe(200);
      expect(await ledger("RESERVATION_REFUND", reservationId)).toHaveLength(1);
      expect(await ledger("PRODUCT_REFUND", productId)).toHaveLength(0);
    });

    it("refunds pending reservations cancelled by blocking a user", async () => {
      const reservationId = await reserve(restaurant, productId, 2);
      expect((await admin.post(`/api/admin/users/${storeId}/block`).send({ reason: "Fraud" })).status).toBe(200);
      expect(await ledger("RESERVATION_REFUND", reservationId)).toHaveLength(1);
    });
  });
});
