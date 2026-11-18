import { screen, waitFor, within } from "@testing-library/react";
import StoreDashboardPage from "./StoreDashboardPage.js";
import RestaurantDashboardPage from "./RestaurantDashboardPage.js";
import { apiMock, makeOrder, makeOrderItem, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { StoreDashboardStats } from "../types/index.js";

// The value printed under a stat card's label (the label is the card's first, truncated line).
const statValue = (label: string) =>
  screen.getByText(label, { selector: '[data-testid="stat-label"]' }).nextElementSibling?.textContent;

// The unit chips under a stat card's value (the shared UnitChips component).
const chipsOf = (label: string) => {
  const card = screen.getByText(label, { selector: '[data-testid="stat-label"]' }).parentElement!;
  return within(within(card).getByTestId("unit-chips")).getAllByRole("listitem").map((chip) => chip.textContent);
};

const paramsOf = (url: string) => apiMock.get.mock.calls.find(([called]) => called === url)?.[1]?.params;

describe("StoreDashboardPage", () => {
  const renderStore = (stats: StoreDashboardStats | Error) =>
    renderWithProviders(<StoreDashboardPage />, {
      route: "/dashboard",
      path: "/dashboard",
      user: makeUser({ role: "STORE" }),
      get: {
        "/dashboard/stats": stats instanceof Error ? stats : { stats },
        "/products/mine": {
          products: [
            makeProduct({ id: 1, name: "Hljeb" }),
            makeProduct({ id: 2, name: "Mlijeko" }),
            makeProduct({ id: 3, name: "Sir" }),
          ],
          total: 40,
        },
        // A single Pending order: the cards must not be computed from this page of the list.
        "/orders/store": { orders: [makeOrder({ id: 9, items: [makeOrderItem({ product_name: "Jogurt" })] })], total: 30 },
      },
    });

  it("shows the server's numbers on the stat cards", async () => {
    renderStore({
      active_products: 17,
      pending_orders: 4,
      successful_orders: 25,
      saved: { kg: 12.5, l: 3, pieces: 8 },
    });

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(statValue(t("dashboard.statActiveProducts"))).toBe("17");
    expect(statValue(t("dashboard.statPending"))).toBe("4");
    expect(statValue(t("dashboard.statConfirmed"))).toBe("25");
    expect(statValue(t("dashboard.statSavedFood"))).toBe("12.5 kg");
    expect(chipsOf(t("dashboard.statSavedFood"))).toEqual(["3 l", `8 ${t("dashboard.piecesShort")}`]);
    // In two columns on a phone the labels wrap instead of being cut off.
    const label = screen.getByText(t("dashboard.statPending"), { selector: '[data-testid="stat-label"]' });
    expect(label).toHaveClass("break-words");
    expect(label).not.toHaveClass("truncate");
  });

  it("shows the other non-zero units of food saved as chips", async () => {
    renderStore({ active_products: 0, pending_orders: 0, successful_orders: 0, saved: { kg: 0, l: 12, pieces: 40 } });

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(statValue(t("dashboard.statSavedFood"))).toBe("12 l");
    expect(chipsOf(t("dashboard.statSavedFood"))).toEqual([`40 ${t("dashboard.piecesShort")}`]);
  });

  it("shows no chips when food was saved in a single unit", async () => {
    renderStore({ active_products: 0, pending_orders: 0, successful_orders: 0, saved: { kg: 5, l: 0, pieces: 0 } });

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(statValue(t("dashboard.statSavedFood"))).toBe("5 kg");
    expect(screen.queryByTestId("unit-chips")).not.toBeInTheDocument();
  });

  it("asks only for the 3 newest available products and orders", async () => {
    renderStore({ active_products: 0, pending_orders: 0, successful_orders: 0, saved: { kg: 0, l: 0, pieces: 0 } });

    expect(await screen.findByText(/Jogurt/)).toBeInTheDocument();
    expect(screen.getByText("Sir")).toBeInTheDocument();
    expect(paramsOf("/products/mine")).toEqual({ status: "Available", limit: 3 });
    expect(paramsOf("/orders/store")).toEqual({ limit: 3 });
    expect(statValue(t("dashboard.statSavedFood"))).toBe("0 kg");
  });

  it("shows zeros when the stats cannot be loaded", async () => {
    renderStore(new Error("Network Error"));

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(statValue(t("dashboard.statActiveProducts"))).toBe("0");
    expect(statValue(t("dashboard.statSavedFood"))).toBe("0 kg");
  });

  it("titles the orders section New orders and links it to Orders", async () => {
    renderStore({ active_products: 0, pending_orders: 0, successful_orders: 0, saved: { kg: 0, l: 0, pieces: 0 } });

    expect(await screen.findByRole("heading", { name: t("dashboard.recentOrdersTitle") })).toHaveTextContent("Nove narudžbe");
    expect(screen.getByRole("link", { name: t("dashboard.viewAllOrders") })).toHaveAttribute("href", "/orders");
  });
});

describe("RestaurantDashboardPage", () => {
  const IMPACT = { impact: { scope: "own", food_kg: 873.94, co2_kg: 2184.85, savings: 1246.5 } };
  const STORES = {
    stores: [
      makeUser({ id: 21, role: "STORE", business_name: "Zeleni Market", distance_km: 0 }),
      makeUser({ id: 22, role: "STORE", business_name: "Pekara Kod Mirze", distance_km: 16 }),
    ],
    total: 2,
  };
  const renderRestaurant = ({
    impact = IMPACT as object | Error,
    active = 2,
    stores = STORES as object | Error,
  } = {}) =>
    renderWithProviders(<RestaurantDashboardPage />, {
      route: "/dashboard",
      path: "/dashboard",
      user: makeUser({ role: "RESTAURANT", latitude: 43.98, longitude: 18.17 }),
      get: {
        "/stats/my-impact": impact,
        "/orders/mine/summary": { summary: { total: 9, active, counts: {} } },
        "/users/stores": stores,
      },
    });
  const heroBox = () => screen.getByTestId("restaurant-hero-wide").parentElement!;
  const pageUrls = () => apiMock.get.mock.calls.map(([url]) => url).filter((url) => url !== "/users/me").sort();

  it("shows the hero with the impact strip, the two links and the nearest stores, without the orders section", async () => {
    renderRestaurant();

    expect(screen.getAllByRole("img", { name: t("restaurantHero.title") })).toHaveLength(2);
    expect(await screen.findByText("873,9 kg")).toBeInTheDocument();
    // The strip is attached under the hero: only the hero's top corners are rounded.
    expect(heroBox()).toHaveClass("rounded-t-2xl");
    expect(screen.getByRole("link", { name: t("restaurantActions.search") })).toHaveAttribute("href", "/search");
    expect(await screen.findByRole("link", { name: /Moje narudžbe/ })).toHaveAttribute("href", "/my-orders");
    expect(await screen.findByRole("link", { name: /Zeleni Market/ })).toHaveAttribute("href", "/stores/21");
    // The carousel: the stores' visibility rules, nearest first, from all cities, at most 20.
    expect(paramsOf("/users/stores")).toEqual({ radius: "all", limit: 20 });
    expect(pageUrls()).toEqual(["/orders/mine/summary", "/stats/my-impact", "/users/stores"]);
    // The orders section is gone, and so are the old stat cards.
    expect(screen.queryByRole("heading", { name: "Moje narudžbe" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("order-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stat-label")).not.toBeInTheDocument();
  });

  it("puts the map pin reminder first", async () => {
    renderWithProviders(<RestaurantDashboardPage />, {
      route: "/dashboard",
      path: "/dashboard",
      user: makeUser({ role: "RESTAURANT", latitude: null, longitude: null }),
      get: { "/stats/my-impact": IMPACT, "/orders/mine/summary": { summary: { active: 0 } }, "/users/stores": STORES },
    });

    const reminder = await screen.findByRole("link", { name: t("location.reminderLink") });
    const hero = screen.getByTestId("restaurant-hero-wide");
    expect(reminder.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the active-order count on My orders, and no badge without active orders", async () => {
    const { unmount } = renderRestaurant({ active: 2 });
    expect(await screen.findByTestId("active-orders-badge")).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: /^Moje narudžbe\s*, 2 aktivne narudžbe$/ })).toBeInTheDocument();
    unmount();

    renderRestaurant({ active: 0 });
    expect(await screen.findByRole("link", { name: "Zeleni Market 0 km" })).toBeInTheDocument();
    expect(screen.queryByTestId("active-orders-badge")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Moje narudžbe" })).toBeInTheDocument();
  });

  it("hides the carousel without stores, and when the stores fail to load", async () => {
    const { unmount } = renderRestaurant({ stores: { stores: [], total: 0 } });
    expect(await screen.findByText("873,9 kg")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("store-carousel")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: t("restaurantActions.search") })).toBeInTheDocument();
    unmount();

    renderRestaurant({ stores: new Error("Network Error") });
    expect(await screen.findByText("873,9 kg")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("store-carousel")).not.toBeInTheDocument());
  });

  it("hides the strip when the impact fails to load and keeps the rest of the page", async () => {
    renderRestaurant({ impact: new Error("Network Error") });

    expect(await screen.findByRole("link", { name: /Zeleni Market/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("impact-strip")).not.toBeInTheDocument());
    expect(heroBox()).toHaveClass("rounded-2xl");
  });

  it("shows the platform's totals with Together we have saved for a restaurant without pickups", async () => {
    renderRestaurant({ impact: { impact: { scope: "platform", food_kg: 5000, co2_kg: 12500, savings: 9000 } } });

    expect(await screen.findByText(t("impactStrip.together"))).toBeInTheDocument();
    expect(screen.getByText("5.000,0 kg")).toBeInTheDocument();
  });
});
