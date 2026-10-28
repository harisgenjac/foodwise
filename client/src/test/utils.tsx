import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AxiosError, AxiosHeaders } from "axios";
import api from "../api/axios.js";
import i18n from "../i18n/config.js";
import { AuthProvider } from "../context/AuthContext.jsx";
import type { Notification } from "../context/NotificationsContext.js";
import type { City, CreditSummary, DonationOffer, Product, Reservation, User } from "../types/index.js";

export const apiMock = vi.mocked(api);
export const t = i18n.t.bind(i18n);

// A rejected axios call as the server sends it: `{ error }` with a status.
// The server's 402 when a product or reservation needs a credit the user does not have.
export const creditError = (hasActiveSubscription: boolean) =>
  new AxiosError("Request failed", "402", undefined, undefined, {
    status: 402,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      error: "Not enough credits.",
      code: "INSUFFICIENT_CREDITS",
      hasActiveSubscription,
      actionUrl: hasActiveSubscription ? "/my-profile#topup" : "/my-profile#subscription",
    },
  });

export const axiosError = (status: number, error = "Greška") =>
  new AxiosError("Request failed", String(status), undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error },
  });

type MockResponse = unknown | Error | ((params: unknown) => unknown);

// Answers api.get by URL; a value is returned as `data`, an Error is thrown, a function gets the query params
// (and may return a promise, to control when the response arrives).
export const mockGet = (routes: Record<string, MockResponse>) => {
  apiMock.get.mockImplementation(async (url: string, config?: { params?: unknown }) => {
    if (!(url in routes)) throw new Error(`Unmocked GET ${url}`);
    const response = routes[url];
    if (response instanceof Error) throw response;
    return { data: typeof response === "function" ? await response(config?.params) : response };
  });
};

// Shows where the router ended up, for asserting redirects and navigation.
export function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

interface RenderOptions {
  // The URL the test starts on and the route pattern the element is mounted at.
  route?: string;
  path?: string;
  // The logged-in user, or null for a visitor (/users/me then answers 401).
  user?: User | null;
  get?: Record<string, MockResponse>;
  // Router location state for the first entry (what navigate(..., { state }) would pass).
  state?: unknown;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = "/", path = "/", user = null, get = {}, state }: RenderOptions = {},
) {
  mockGet({
    "/users/me": user ? { user } : axiosError(401, "Niste prijavljeni."),
    "/cities": { cities: CITIES },
    ...get,
  });
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[state === undefined ? route : { pathname: route, state }]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

// A short city list for CitySelect, in the server's (Bosnian alphabetical) order.
export const CITIES: City[] = [
  { id: 1, name: "Sarajevo" },
  { id: 2, name: "Tuzla" },
  { id: 3, name: "Zenica" },
  { id: 4, name: "Žepče" },
];

export const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  first_name: "Amir",
  last_name: "Hodžić",
  email: "amir@test.com",
  role: "RESTAURANT",
  ...overrides,
});

export const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 10,
  store_id: 2,
  name: "Piletina",
  description: "Svježa piletina",
  category: "Meat",
  original_price: "10.00",
  discounted_price: "5.00",
  quantity: "8",
  available_quantity: "8",
  unit: "kg",
  expiry_date: "2030-01-01",
  status: "Available",
  created_at: "2030-01-01T00:00:00.000Z",
  updated_at: "2030-01-01T00:00:00.000Z",
  days_until_expiry: 3,
  business_name: "Market Centar",
  city: "Sarajevo",
  ...overrides,
});

export const makeReservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 20,
  product_id: 10,
  restaurant_id: 1,
  quantity: "2",
  status: "Pending",
  pickup_date: "2030-01-01T10:00:00.000Z",
  created_at: "2030-01-01T00:00:00.000Z",
  updated_at: "2030-01-01T00:00:00.000Z",
  product_name: "Piletina",
  unit: "kg",
  discounted_price: "5.00",
  original_price: "10.00",
  category: "Meat",
  business_name: "Market Centar",
  city: "Sarajevo",
  ...overrides,
});

export const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 30,
  user_id: 1,
  type: "RESERVATION_CREATED",
  message: "New reservation request: 2kg Piletina",
  is_read: false,
  created_at: new Date().toISOString(),
  reservation_id: 20,
  product_id: 10,
  product_name: "Piletina",
  unit: "kg",
  quantity: "2",
  ...overrides,
});

export const makeDonation = (overrides: Partial<DonationOffer> = {}): DonationOffer => ({
  id: 30,
  donor_id: 2,
  source_product_id: null,
  donation_type: "FREE",
  name: "Hljeb",
  description: "Jučerašnji hljeb",
  category: "Bakery",
  quantity: "20",
  unit: "kom",
  original_price: "2",
  donation_price: null,
  expiry_date: "2030-01-01",
  pickup_from: null,
  pickup_until: null,
  allergens: [],
  serving_temperature: null,
  status: "Available",
  created_at: "2030-01-01T00:00:00.000Z",
  updated_at: "2030-01-01T00:00:00.000Z",
  ...overrides,
});

// GET /credits/me: an active Standard subscription with 50 credits, 10 used.
export const makeCreditSummary = (overrides: Partial<CreditSummary> = {}): CreditSummary => ({
  periodStart: "2030-01-01",
  periodEnd: "2030-01-31",
  subscription: {
    id: 1,
    plan_id: 2,
    plan_name: "Standard",
    credits_per_period: 50,
    period_month: "2030-01-01",
    auto_renew: false,
  },
  hasActiveSubscription: true,
  total: 50,
  used: 10,
  available: 40,
  nextSubscription: null,
  pendingRequests: [],
  managedByCompany: false,
  companyName: null,
  ...overrides,
});
