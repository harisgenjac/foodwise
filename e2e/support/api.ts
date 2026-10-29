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

// The logged-in account's own id.
export const myId = async (api: APIRequestContext) => {
  const { user } = await ok<{ user: { id: number } }>(await api.get("/api/users/me"));
  return user.id;
};

// Reserves as a restaurant (costs it 1 credit); pickup tomorrow unless a date is given.
export const reserve = async (api: APIRequestContext, productId: number, quantity: number, pickupDate = isoDate(1)) => {
  const { reservation } = await ok<{ reservation: { id: number } }>(
    await api.post("/api/reservations", { data: { product_id: productId, quantity, pickup_date: pickupDate } }),
  );
  return reservation;
};

// The store's side of a reservation: accept it, or mark it picked up.
export const acceptReservation = async (api: APIRequestContext, reservationId: number) =>
  ok(await api.patch(`/api/reservations/${reservationId}/accept`));
export const completeReservation = async (api: APIRequestContext, reservationId: number) =>
  ok(await api.patch(`/api/reservations/${reservationId}/complete`));

// A new store in Visoko with a complete profile, its own password set and no plan, logged in.
// For tests that need a state the shared seeded accounts lose after one run (here: no plan yet),
// so the test survives retries and --repeat-each.
export const createStoreWithoutPlan = async () => {
  const id = runId();
  const store = {
    email: `e2e-store-${id}@foodwise.test`,
    firstName: "Lejla",
    lastName: "Prodavac",
    businessName: `E2E Market ${id}`,
  };
  const temporaryPassword = `Privremena-${id}`;

  const admin = await apiAs("admin");
  const { user } = await ok<{ user: { id: number } }>(
    await admin.post("/api/admin/users", {
      data: { role: "STORE", email: store.email, password: temporaryPassword },
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
