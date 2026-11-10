// Arranging data through the API: whatever a test needs but does not test (a product to reserve,
// a fresh account) is created here, and the behaviour under test is clicked through the UI.
// An APIRequestContext sends no Origin or Referer, so the server's origin check lets it through.
import { expect, request, type APIRequestContext, type APIResponse } from "@playwright/test";
import { API_URL, PASSWORD, runId, storageState, type SeededRole } from "./accounts.js";
import { isoDate } from "./dates.js";

// The JSON body of a successful response; fails the test with the server's answer otherwise.
const ok = async <T>(response: APIResponse): Promise<T> => {
  expect(response.ok(), `${response.url()} → ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
};

// An API client with a seeded role's session (from the setup project).
export const apiAs = (role: SeededRole) => request.newContext({ baseURL: API_URL, storageState: storageState(role) });

// An API client logged in as any account.
export const apiLogin = async (email: string, password: string) => {
  const api = await request.newContext({ baseURL: API_URL });
  await ok(await api.post("/api/auth/login", { data: { email, password } }));
  return api;
};

export const cityId = async (api: APIRequestContext, name: string) => {
  const { cities } = await ok<{ cities: { id: number; name: string }[] }>(await api.get("/api/cities"));
  const city = cities.find((row) => row.name === name);
  if (!city) throw new Error(`City ${name} is missing.`);
  return city.id;
};

type NewProduct = {
  name: string;
  quantity?: number;
  category?: string;
  unit?: string;
  original_price?: number;
  discounted_price?: number;
  expiry_date?: string;
};

// Publishes a product as a store (costs the store 1 credit). Defaults: Dairy, 4 → 2 KM, 10 kg,
// expiring in 3 days.
export const createProduct = async (api: APIRequestContext, product: NewProduct) => {
  const { product: created } = await ok<{ product: { id: number } }>(
    await api.post("/api/products", {
      data: {
        category: "Dairy",
        original_price: 4,
        discounted_price: 2,
        quantity: 10,
        unit: "kg",
        expiry_date: isoDate(3),
        ...product,
      },
    }),
  );
  return created;
};

// Publishes a free donation as a store or restaurant (donations cost no credits). Defaults: Dairy,
// 5 kg worth 4 KM each, last day in 3 days.
export const createDonation = async (api: APIRequestContext, name: string) => {
  const { donation } = await ok<{ donation: { id: number } }>(
    await api.post("/api/donations", {
      data: {
        donation_type: "FREE",
        name,
        category: "Dairy",
        quantity: 5,
        unit: "kg",
        original_price: 4,
        expiry_date: isoDate(3),
      },
    }),
  );
  return donation;
};

// The logged-in account's own id.
export const myId = async (api: APIRequestContext) => {
  const { user } = await ok<{ user: { id: number } }>(await api.get("/api/users/me"));
  return user.id;
};

// Sends a one-item order as a restaurant (restaurants pay no credits) at the product's current
// price, with partial fulfilment off; pickup tomorrow at 12:00 unless a date is given.
export const sendOrder = async (api: APIRequestContext, productId: number, quantity: number, pickupDate = isoDate(1)) => {
  const { product } = await ok<{ product: { discounted_price: string } }>(await api.get(`/api/products/${productId}`));
  const { order } = await ok<{ order: { id: number; code: string } }>(
    await api.post("/api/orders", {
      data: {
        pickup_at: `${pickupDate}T12:00`,
        accept_partial: false,
        items: [{ product_id: productId, quantity, unit_price: product.discounted_price }],
      },
    }),
  );
  return order;
};

// The code of the restaurant's order that contains `productName` (shown as #K7PM), to find its
// notifications and emails.
export const orderCode = async (api: APIRequestContext, productName: string) => {
  const { orders } = await ok<{ orders: { code: string }[] }>(
    await api.get(`/api/orders/mine?name=${encodeURIComponent(productName)}`),
  );
  expect(orders, `one order with ${productName}`).toHaveLength(1);
  return orders[0]!.code;
};

// Sends one order of several products of one store (the dialog orders one product; the cart comes
// later), each at its shown price, pickup tomorrow at 12:00.
export const sendOrderOf = async (
  api: APIRequestContext,
  lines: { productId: number; quantity: number; unitPrice: number }[],
  acceptPartial = true,
) => {
  const { order } = await ok<{ order: { id: number; code: string } }>(
    await api.post("/api/orders", {
      data: {
        pickup_at: `${isoDate(1)}T12:00`,
        accept_partial: acceptPartial,
        items: lines.map((line) => ({ product_id: line.productId, quantity: line.quantity, unit_price: line.unitPrice })),
      },
    }),
  );
  return order;
};

// The store's side of an order: accept every item, or mark it picked up.
export const acceptOrder = async (api: APIRequestContext, orderId: number) => {
  const { order } = await ok<{ order: { items: { id: number }[] } }>(await api.get(`/api/orders/${orderId}`));
  return ok(
    await api.post(`/api/orders/${orderId}/decision`, {
      data: { items: order.items.map((item) => ({ item_id: item.id, action: "ACCEPT" })) },
    }),
  );
};
export const completeOrder = async (api: APIRequestContext, orderId: number) =>
  ok(await api.post(`/api/orders/${orderId}/complete`));

// A new store (or restaurant) in Visoko with a complete profile, its own password set and no plan,
// logged in. For tests that need a state the shared seeded accounts lose after one run (here: no
// plan yet), so the test survives retries and --repeat-each.
export const createStoreWithoutPlan = async (role: "STORE" | "RESTAURANT" = "STORE") => {
  const id = runId();
  const store = {
    email: `e2e-${role.toLowerCase()}-${id}@foodwise.test`,
    firstName: "Lejla",
    lastName: "Prodavac",
    businessName: `${role === "STORE" ? "E2E Market" : "E2E Bistro"} ${id}`,
  };
  const temporaryPassword = `Privremena-${id}`;

  const admin = await apiAs("admin");
  const { user } = await ok<{ user: { id: number } }>(
    await admin.post("/api/admin/users", {
      data: { role, email: store.email, password: temporaryPassword },
    }),
  );
  await ok(
    await admin.put(`/api/admin/users/${user.id}/profile`, {
      data: {
        first_name: store.firstName,
        last_name: store.lastName,
        business_name: store.businessName,
        city_id: await cityId(admin, "Visoko"),
        address: "Čaršijska 3",
        phone: "061 222 333",
      },
    }),
  );
  await admin.dispose();

  const api = await apiLogin(store.email, temporaryPassword);
  await ok(
    await api.put("/api/users/me/password", {
      data: { current_password: temporaryPassword, new_password: PASSWORD },
    }),
  );
  const session = await api.storageState();
  await api.dispose();
  return { ...store, storageState: session };
};

// A pending subscription request for this month (plan Standard) from an account made by
// createStoreWithoutPlan, for the admin's credit request list.
export const requestSubscription = async (session: Awaited<ReturnType<typeof createStoreWithoutPlan>>["storageState"]) => {
  const api = await request.newContext({ baseURL: API_URL, storageState: session });
  const { plans } = await ok<{ plans: { id: number; name: string }[] }>(await api.get("/api/credits/plans"));
  const standard = plans.find((plan) => plan.name === "Standard");
  expect(standard, "plan Standard").toBeDefined();
  const { request: created } = await ok<{ request: { id: number } }>(
    await api.post("/api/credits/requests", {
      data: { request_type: "SUBSCRIPTION", plan_id: standard!.id, period: "current", auto_renew: false },
    }),
  );
  await api.dispose();
  return created;
};
