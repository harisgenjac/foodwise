import { screen, within } from "@testing-library/react";
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
  const renderRestaurant = (orders: ReturnType<typeof makeOrder>[]) =>
    renderWithProviders(<RestaurantDashboardPage />, {
      route: "/dashboard",
      path: "/dashboard",
      user: makeUser({ role: "RESTAURANT", latitude: 43.98, longitude: 18.17 }),
      get: { "/orders/mine": { orders, total: orders.length } },
    });

  it("shows the hero and the first 3 orders, and asks for nothing else", async () => {
    renderRestaurant([makeOrder({ id: 9, status: "Confirmed", items: [makeOrderItem({ product_name: "Jogurt" })] })]);

    expect(await screen.findByText(/Jogurt/)).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: t("restaurantHero.title") })).toHaveLength(2);
    expect(paramsOf("/orders/mine")).toEqual({ limit: 3 });
    // The page itself asks only for the orders (the auth context loads /users/me).
    expect(apiMock.get.mock.calls.map(([url]) => url).filter((url) => url !== "/users/me")).toEqual(["/orders/mine"]);
    expect(screen.queryByTestId("stat-label")).not.toBeInTheDocument();
  });

  it("titles the orders section My orders, like the page its link opens", async () => {
    renderRestaurant([]);

    expect(await screen.findByRole("heading", { name: t("dashboard.myOrdersTitle") })).toHaveTextContent(
      "Moje narudžbe",
    );
    expect(screen.queryByRole("heading", { name: t("dashboard.recentOrdersTitle") })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("dashboard.viewAllOrders") })).toHaveAttribute("href", "/my-orders");
  });

  it("sends a restaurant without orders to the offers", async () => {
    renderRestaurant([]);

    expect(await screen.findByText(t("dashboard.noOrders"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("dashboard.browseOffers") })).toHaveAttribute("href", "/search");
  });
});
