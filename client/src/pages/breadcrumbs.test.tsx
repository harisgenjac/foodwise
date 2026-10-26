import { screen, waitFor, within } from "@testing-library/react";
import ProductDetailsPage from "./ProductDetailsPage.js";
import ReservationDetailsPage from "./ReservationDetailsPage.js";
import StoreDetailsPage from "./StoreDetailsPage.js";
import AdminUserDetailsPage from "./admin/AdminUserDetailsPage.js";
import {
  axiosError,
  makeProduct,
  makeReservation,
  makeUser,
  renderWithProviders,
  t,
} from "../test/utils.js";
import type { User } from "../types/index.js";

const STORE = makeUser({ id: 2, role: "STORE", business_name: "Market Centar" });
const RESTAURANT = makeUser({ id: 1, role: "RESTAURANT" });
const ADMIN = makeUser({ id: 9, role: "ADMIN" });
const PRODUCT = makeProduct({ id: 10, store_id: 2, name: "Piletina", business_name: "Market Centar" });

// The full trail as [label, href] pairs; the current page has no href.
const trail = () =>
  within(screen.getByRole("navigation", { name: t("breadcrumbs.label") }))
    .getAllByRole("listitem")
    .map((item) => [item.textContent, item.querySelector("a")?.getAttribute("href") ?? null]);

const expectTrail = (expected: [string, string | null][]) => waitFor(() => expect(trail()).toEqual(expected));

const renderProduct = (user: User, { state, product = PRODUCT }: { state?: unknown; product?: unknown } = {}) =>
  renderWithProviders(<ProductDetailsPage />, {
    route: "/products/10",
    path: "/products/:id",
    user,
    state,
    get: { "/products/10": product instanceof Error ? product : { product } },
  });

describe("Product details breadcrumbs", () => {
  it("puts a store's product under My products", async () => {
    renderProduct(STORE);
    await expectTrail([
      [t("sidebar.myProducts"), "/my-products"],
      ["Piletina", null],
    ]);
  });

  it("puts a restaurant's product under Browse products", async () => {
    renderProduct(RESTAURANT);
    await expectTrail([
      [t("sidebar.browseProducts"), "/browse-products"],
      ["Piletina", null],
    ]);
  });

  it("shows the store when the product was opened from the store profile", async () => {
    renderProduct(RESTAURANT, { state: { fromStore: true } });
    await expectTrail([
      [t("sidebar.stores"), "/stores"],
      ["Market Centar", "/stores/2"],
      ["Piletina", null],
    ]);
  });

  it("ignores the store context for a store's own product", async () => {
    renderProduct(STORE, { state: { fromStore: true } });
    await expectTrail([
      [t("sidebar.myProducts"), "/my-products"],
      ["Piletina", null],
    ]);
  });

  it("shows a placeholder while the product loads", () => {
    renderProduct(STORE);
    const current = screen.getByText(t("common.loading")).closest("[aria-current]");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("shows only the parent when the product is not found", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderProduct(RESTAURANT, { product: axiosError(404, "Product not found.") });

    await screen.findByText(t("myProducts.productNotFoundTitle"));
    await expectTrail([[t("sidebar.browseProducts"), "/browse-products"]]);
  });
});

describe("Reservation details breadcrumbs", () => {
  const reservation = makeReservation({ id: 7 });

  it.each([
    ["store", STORE, "sidebar.reservations", "/reservations"],
    ["restaurant", RESTAURANT, "sidebar.myReservations", "/my-reservations"],
  ])("puts the reservation under the %s's list", async (_role, user, labelKey, to) => {
    renderWithProviders(<ReservationDetailsPage />, {
      route: "/reservation/7",
      path: "/reservation/:id",
      user,
      get: { "/reservations/7": { reservation } },
    });

    await screen.findByText(reservation.product_name!);
    await expectTrail([
      [t(labelKey), to],
      [t("breadcrumbs.reservation", { id: "7" }), null],
    ]);
  });
});

describe("Store details breadcrumbs", () => {
  const renderStore = (storeResponse: unknown) =>
    renderWithProviders(<StoreDetailsPage />, {
      route: "/stores/2",
      path: "/stores/:id",
      user: RESTAURANT,
      get: {
        "/users/stores/2": storeResponse,
        "/favorites": { favorites: [] },
        "/products": { products: [PRODUCT], total: 1 },
        "/reservations/mine": { reservations: [], total: 0 },
      },
    });

  it("puts the store under Stores", async () => {
    renderStore({
      store: STORE,
      stats: { sold_articles: "0", successful_reservations: "0" },
      myReservations: { my_reservations_count: "0" },
    });

    await expectTrail([
      [t("sidebar.stores"), "/stores"],
      ["Market Centar", null],
    ]);
  });

  it("shows only Stores when the store is not found", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderStore(axiosError(404, "Store not found."));

    await screen.findByText(t("store.storeNotFound"));
    await expectTrail([[t("sidebar.stores"), "/stores"]]);
  });
});

describe("Admin user details breadcrumbs", () => {
  const renderUser = (response: unknown) =>
    renderWithProviders(<AdminUserDetailsPage />, {
      route: "/admin/users/9",
      path: "/admin/users/:id",
      user: ADMIN,
      get: { "/admin/users/9": response },
    });

  it("puts the user under Users", async () => {
    const counts = {
      products: 0,
      active_products: 0,
      reservations: 0,
      pending_reservations: 0,
      completed_reservations: 0,
      donations: 0,
    };
    renderUser({ user: ADMIN, counts, actions: [] });

    await expectTrail([
      [t("sidebar.adminUsers"), "/admin/users"],
      ["Amir Hodžić", null],
    ]);
  });

  it("shows only Users when the user is not found", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderUser(axiosError(404, "User not found."));

    await screen.findByText(t("admin.userDetails.notFoundTitle"));
    await expectTrail([[t("sidebar.adminUsers"), "/admin/users"]]);
  });
});
