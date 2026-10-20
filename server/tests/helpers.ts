import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";

export type Agent = ReturnType<typeof request.agent>;
export type Role = "STORE" | "RESTAURANT";

export const PASSWORD = "test12345";

export const registerUser = (email: string, role: Role, firstName = "Test", lastName = "User") =>
  request(app).post("/api/auth/register").send({
    first_name: firstName,
    last_name: lastName,
    email,
    password: PASSWORD,
    role,
  });

// Registers a user and returns an agent that keeps the login cookie.
export const registerAndLogin = async (email: string, role: Role): Promise<Agent> => {
  await registerUser(email, role);
  const agent = request.agent(app);
  const login = await agent.post("/api/auth/login").send({ email, password: PASSWORD });
  if (login.status !== 200) {
    throw new Error(`Login for ${email} failed with ${login.status}`);
  }
  return agent;
};

export const userId = async (email: string): Promise<number> => {
  const result = await pool.query<{ id: number }>("SELECT id FROM users WHERE email = $1", [email]);
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

export const reserve = async (restaurant: Agent, productId: number, quantity: number) => {
  const response = await restaurant
    .post("/api/reservations")
    .send({ product_id: productId, quantity, pickup_date: futurePickup() });
  if (response.status !== 201) {
    throw new Error(`Reserving failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body.reservation.id as number;
};

// Reservations go first because their foreign keys are ON DELETE RESTRICT;
// deleting the users then cascades to products, notifications, favorites and templates.
export const cleanupUsers = async (emails: string[]) => {
  await pool.query(
    `DELETE FROM reservations
     WHERE restaurant_id IN (SELECT id FROM users WHERE email = ANY($1))
        OR product_id IN (
          SELECT products.id FROM products
          JOIN users ON products.store_id = users.id
          WHERE users.email = ANY($1)
        )`,
    [emails],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
};
