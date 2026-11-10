import request from "supertest";
import app from "../src/app.js";
import bcrypt from "bcrypt";
import pool from "../src/config/db.js";
import { creditMonth } from "../src/utils/creditTime.js";
import { generateOrderCode } from "../src/services/orders/codes.js";

export type Agent = ReturnType<typeof request.agent>;
export type Role = "STORE" | "RESTAURANT" | "ADMIN" | "COMPANY";

export const PASSWORD = "test12345";

// Public registration no longer creates these roles (an admin does), so tests insert the
// account directly. Stores and restaurants get a business name, because the marketplace
// hides stores whose profile is not filled in. A store also gets a subscription for the current
// month with `credits` credits (null = none), so creating products is not limited by credits
// unless a test wants that; restaurants pay no credits. Hashed once: bcrypt is slow. A COMPANY
// user (and a branch store) needs `companyId`; company users have no business name and no credits.
let passwordHash: Promise<string> | undefined;
export const insertUser = async (
  email: string,
  role: Role,
  businessName: string | null = "Test Business",
  credits: number | null = 1000,
  companyId: number | null = null,
) => {
  passwordHash ??= bcrypt.hash(PASSWORD, 10);
  const isBusiness = role === "STORE" || role === "RESTAURANT";
  const result = await pool.query<{ id: number }>(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, business_name, company_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    ["Test", "User", email, await passwordHash, role, isBusiness ? businessName : null, companyId],
  );
  if (role === "STORE" && credits !== null) {
    await giveSubscription(result.rows[0]!.id, credits);
  }
};

// A company row straight in the database (POST /api/admin/companies is tested on its own).
export const insertCompany = async (name: string): Promise<number> => {
  const result = await pool.query<{ id: number }>("INSERT INTO companies (name) VALUES ($1) RETURNING id", [name]);
  return result.rows[0]!.id;
};

// Run after cleanupUsers (users keep companies with RESTRICT). Matches names case-insensitively.
export const cleanupCompanies = async (names: string[]) => {
  await pool.query(
    "DELETE FROM admin_actions WHERE target_company_id IN (SELECT id FROM companies WHERE LOWER(name) = ANY($1))",
    [names.map((name) => name.toLowerCase())],
  );
  await pool.query("DELETE FROM users WHERE company_id IN (SELECT id FROM companies WHERE LOWER(name) = ANY($1))", [
    names.map((name) => name.toLowerCase()),
  ]);
  await pool.query("DELETE FROM companies WHERE LOWER(name) = ANY($1)", [names.map((name) => name.toLowerCase())]);
};

// A subscription (Pro plan) for the credit month of `now`, whose grant holds `credits` credits.
export const giveSubscription = async (id: number, credits: number, now = new Date()) => {
  const periodMonth = creditMonth(now);
  const subscription = await pool.query<{ id: number }>(
    `INSERT INTO subscriptions (user_id, plan_id, period_month)
     VALUES ($1, (SELECT id FROM plans WHERE name = 'Pro'), $2)
     RETURNING id`,
    [id, periodMonth],
  );
  if (credits > 0) {
    await pool.query(
      `INSERT INTO credit_transactions (user_id, subscription_id, period_month, amount, type, actor, created_at)
       VALUES ($1, $2, $3, $4, 'PLAN_GRANT', 'SYSTEM', $5)`,
      [id, subscription.rows[0]!.id, periodMonth, credits, now],
    );
  }
  return subscription.rows[0]!.id;
};

export const login = async (email: string, password = PASSWORD): Promise<Agent> => {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Login for ${email} failed with ${response.status}`);
  }
  return agent;
};

// Creates a user and returns an agent that keeps the login cookie.
export const registerAndLogin = async (email: string, role: Role): Promise<Agent> => {
  await insertUser(email, role);
  return login(email);
};

export const userId = async (email: string): Promise<number> => {
  const result = await pool.query<{ id: number }>("SELECT id FROM users WHERE email = $1", [email]);
  return result.rows[0]!.id;
};

// The id of a city from the list the migration fills (e.g. "Sarajevo").
export const cityId = async (name: string): Promise<number> => {
  const result = await pool.query<{ id: number }>("SELECT cities.id FROM cities WHERE cities.name = $1", [name]);
  return result.rows[0]!.id;
};

// Dates relative to today, so the tests never go stale. Built from the local
// date (not toISOString, which is UTC) so they agree with CURRENT_DATE around midnight.
export const futureDate = (days = 30) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

export const futurePickup = (days = 1) => `${futureDate(days)}T10:00:00.000Z`;

export const productPayload = (overrides: Record<string, unknown> = {}) => ({
  name: "Test Product",
  description: "Test description",
  category: "Meat",
  original_price: 10,
  discounted_price: 5,
  quantity: 10,
  unit: "kg",
  expiry_date: futureDate(),
  ...overrides,
});

export interface Product {
  id: number;
  store_id: number;
  name: string;
  category: string;
  quantity: string;
  status: string;
}

export const createProduct = async (store: Agent, overrides: Record<string, unknown> = {}): Promise<Product> => {
  const response = await store.post("/api/products").send(productPayload(overrides));
  if (response.status !== 201) {
    throw new Error(`Creating a product failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body.product;
};

export const donationPayload = (overrides: Record<string, unknown> = {}) => ({
  donation_type: "FREE",
  name: "Test Donation",
  description: "Test description",
  category: "Bakery",
  quantity: 10,
  unit: "kom",
  original_price: 2,
  expiry_date: futureDate(3),
  ...overrides,
});

export const createDonation = async (donor: Agent, overrides: Record<string, unknown> = {}) => {
  const response = await donor.post("/api/donations").send(donationPayload(overrides));
  if (response.status !== 201) {
    throw new Error(`Creating a donation failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body.donation as { id: number; status: string; donation_type: string };
};

// Sends a one-item order at the product's current price with partial fulfilment off (the
// restaurant gets exactly what it asked for or nothing). Returns the item's id.
export const reserve = async (restaurant: Agent, productId: number, quantity: number, pickupAt = futurePickup()) => {
  const price = await pool.query<{ discounted_price: string }>("SELECT discounted_price FROM products WHERE id = $1", [
    productId,
  ]);
  const response = await restaurant.post("/api/orders").send({
    pickup_at: pickupAt,
    accept_partial: false,
    items: [{ product_id: productId, quantity, unit_price: price.rows[0]?.discounted_price ?? 0 }],
  });
  if (response.status !== 201) {
    throw new Error(`Sending an order failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body.order.items[0].id as number;
};

// The store accepts the whole order of an item.
export const acceptItem = async (store: Agent, itemId: number) =>
  store.post(`/api/orders/${await orderOf(itemId)}/decision`).send({ items: [{ item_id: itemId, action: "ACCEPT" }] });

// The store rejects the whole order of an item (reason: quality).
export const rejectItem = async (store: Agent, itemId: number) =>
  store.post(`/api/orders/${await orderOf(itemId)}/decision`).send({ reject_order: true, reason: "QUALITY" });

// cancel (restaurant), complete or cancel-overdue (store) on the order of an item.
export const itemOrderAction = async (agent: Agent, itemId: number, action: "cancel" | "complete" | "cancel-overdue") =>
  agent.post(`/api/orders/${await orderOf(itemId)}/${action}`);

export interface OrderItemInput {
  productId: number;
  restaurantId: number;
  quantity: number;
  unitPrice?: number;
  // The item's status; the one-item order gets the same.
  status?: string;
  // What the order sent (default `quantity`); above `quantity` when the store accepted less.
  orderedQuantity?: number;
  // SQL expressions (fixed text from the test, never input): the pickup, the pickup moment of a
  // Completed item (default NOW()) and when the order was sent (default NOW()).
  pickupAt?: string;
  pickedUpAt?: string;
  createdAt?: string;
  acceptPartial?: boolean;
}

// A one-item order straight in the database, in any status (the API only reaches statuses by its
// own steps). Returns the order's and the item's id.
export const insertOrderItem = async ({
  productId,
  restaurantId,
  quantity,
  unitPrice = 5,
  status = "Pending",
  orderedQuantity = quantity,
  pickupAt = "CURRENT_DATE + 1",
  pickedUpAt = "NOW()",
  createdAt = "NOW()",
  acceptPartial = true,
}: OrderItemInput) => {
  const pickedUp = status === "Completed" ? pickedUpAt : "NULL";
  let order: { id: number } | undefined;
  while (!order) {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO orders (store_id, restaurant_id, code, status, pickup_at, accept_partial, picked_up_at, created_at)
       SELECT products.store_id, $2, $3, $4::order_status, (${pickupAt})::timestamp, $5, ${pickedUp}, ${createdAt}
       FROM products WHERE products.id = $1
       ON CONFLICT (store_id, code) DO NOTHING
       RETURNING orders.id`,
      [productId, restaurantId, generateOrderCode(), status, acceptPartial],
    );
    order = inserted.rows[0];
  }
  const item = await pool.query<{ id: number }>(
    `INSERT INTO reservations
       (order_id, product_id, restaurant_id, quantity, ordered_quantity, unit_price, status, pickup_date, picked_up_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::reservation_status, (${pickupAt})::timestamp, ${pickedUp}, ${createdAt})
     RETURNING reservations.id`,
    [order.id, productId, restaurantId, quantity, orderedQuantity, unitPrice, status],
  );
  return { orderId: order.id, itemId: item.rows[0]!.id };
};

// The order of an item (a reservation row).
export const orderOf = async (itemId: number): Promise<number> =>
  (await pool.query<{ order_id: number }>("SELECT order_id FROM reservations WHERE id = $1", [itemId])).rows[0]!
    .order_id;

// The audit log and announcements go first because they keep an admin from being deleted
// (RESTRICT), then the credit ledger and the orders (also RESTRICT; their items go with them);
// deleting the users cascades to products, notifications, favorites, templates, subscriptions and
// credit requests.
export const cleanupUsers = async (emails: string[]) => {
  // The ledger is append-only; its trigger allows deletes only with app.ledger_maintenance on.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.ledger_maintenance = 'on'");
    await client.query(
      `DELETE FROM credit_transactions
       WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))
          OR created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
      [emails],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await pool.query(
    "DELETE FROM admin_actions WHERE admin_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [emails],
  );
  await pool.query(
    "DELETE FROM announcements WHERE admin_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [emails],
  );
  await pool.query(
    `DELETE FROM orders
     WHERE restaurant_id IN (SELECT id FROM users WHERE email = ANY($1))
        OR store_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
};
