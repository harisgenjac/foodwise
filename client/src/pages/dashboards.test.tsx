import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import StoreDashboardPage from "./StoreDashboardPage.js";
import RestaurantDashboardPage from "./RestaurantDashboardPage.js";
import toast from "react-hot-toast";
import AppToaster from "../components/AppToaster.js";
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
  const IMPACT = { impact: { food_kg: 873.94, co2_kg: 2184.85, savings: 1246.5 } };
  const STORES = {
    stores: [
      makeUser({ id: 21, role: "STORE", business_name: "Zeleni Market", distance_km: 0 }),
      makeUser({ id: 22, role: "STORE", business_name: "Pekara Kod Mirze", distance_km: 16, logo_url: "/uploads/logos/pekara.png" }),
    ],
    total: 2,
  };
  const renderRestaurant = ({
    impact = IMPACT as object | Error,
    stores = STORES as object | Error,
    withToaster = false,
  } = {}) =>
    renderWithProviders(
      <>
        {withToaster && <AppToaster />}
        <RestaurantDashboardPage />
      </>,
      {
        route: "/dashboard",
        path: "/dashboard",
        user: makeUser({ role: "RESTAURANT", latitude: 43.98, longitude: 18.17 }),
        get: { "/stats/my-impact": impact, "/users/stores": stores },
      },
    );
  const pageUrls = () => apiMock.get.mock.calls.map(([url]) => url).filter((url) => url !== "/users/me").sort();
  const statValues = () => screen.getAllByTestId("home-stat-value").map((node) => node.textContent);

  it("shows the hero (the brand as the only h1, the text, Shop now, Track delivery, the chef) with the stats, then the store slider", async () => {
    renderRestaurant();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Još vrijedi" })).toBeInTheDocument();
    expect(screen.getByText(t("restaurantHome.hero.text"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("restaurantHome.hero.shopNow") })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("button", { name: t("restaurantHome.hero.trackDelivery") })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: t("restaurantHome.hero.chef") })).toBeInTheDocument();

    // The restaurant's own numbers, formatted for Bosnian.
    await waitFor(() => expect(statValues()).toEqual(["873,9 kg", "2.184,9 kg", "1.246,50 KM"]));
    const stats = screen.getByRole("group", { name: t("restaurantHome.stats.label") });
    expect(within(stats).getByRole("button", { name: t("restaurantHome.stats.co2Info") })).toHaveAccessibleDescription(
      `${t("restaurantHome.stats.co2")} ${t("restaurantHome.stats.co2Tip")}`,
    );

    // The slider: the stores' visibility rules, nearest first, from all cities, at most 20; each
    // card links to its store.
    const slider = screen.getByRole("region", { name: t("restaurantHome.stores.label") });
    expect(await within(slider).findByRole("link", { name: "Zeleni Market" })).toHaveAttribute("href", "/stores/21");
    expect(within(slider).getByRole("link", { name: "Pekara Kod Mirze" })).toHaveAttribute("href", "/stores/22");
    expect(paramsOf("/users/stores")).toEqual({ radius: "all", limit: 20 });
    expect(pageUrls()).toEqual(["/stats/my-impact", "/users/stores"]);
    expect(screen.getByTestId("home-hero").compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A store without a logo shows its initials, one with a logo the image.
    expect(within(slider).getByText("ZM")).toBeInTheDocument();
    expect(within(slider).getByRole("link", { name: "Pekara Kod Mirze" }).querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/logos/pekara.png"),
    );
  });

  it("shows zeros to a restaurant that has picked nothing up yet", async () => {
    renderRestaurant({ impact: { impact: { food_kg: 0, co2_kg: 0, savings: 0 } } });

    await waitFor(() => expect(statValues()).toEqual(["0,0 kg", "0,0 kg", "0,00 KM"]));
    expect(screen.queryByText(/Zajedno smo spasili/)).not.toBeInTheDocument();
  });

  it("opens a stat's tooltip on hover and focus and closes it on Escape", async () => {
    renderRestaurant();
    const button = await screen.findByRole("button", { name: t("restaurantHome.stats.savedInfo") });
    const tip = screen
      .getAllByRole("tooltip", { hidden: true })
      .find((node) => node.textContent?.includes(t("restaurantHome.stats.savedTip")))!;
    expect(tip).toHaveAttribute("data-open", "false");

    fireEvent.mouseEnter(button);
    expect(tip).toHaveAttribute("data-open", "true");
    fireEvent.mouseLeave(button);
    expect(tip).toHaveAttribute("data-open", "false");

    fireEvent.focus(button);
    expect(tip).toHaveAttribute("data-open", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(tip).toHaveAttribute("data-open", "false");
  });

  it("shows a Coming soon toast for Track delivery and stays on the page", async () => {
    // jsdom has no matchMedia; react-hot-toast asks it about reduced motion.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
    renderRestaurant({ withToaster: true });
    fireEvent.click(screen.getByRole("button", { name: t("restaurantHome.hero.trackDelivery") }));

    expect(await screen.findByText(t("restaurantHome.hero.comingSoon"))).toBeInTheDocument();
    expect(screen.getByTestId("home-hero")).toBeInTheDocument();
    act(() => toast.remove());
    vi.unstubAllGlobals();
  });

  it("changes the chef's message every 3 seconds, and keeps the first one with reduced motion", () => {
    vi.useFakeTimers();
    try {
      const messages = t("restaurantHome.hero.bubble", { returnObjects: true }) as unknown as string[];
      const { unmount } = renderRestaurant();
      const bubble = screen.getByTestId("home-bubble");
      expect(bubble).toHaveAttribute("aria-live", "polite");
      expect(bubble).toHaveTextContent(messages[0]!);
      act(() => vi.advanceTimersByTime(3000));
      expect(bubble).toHaveTextContent(messages[1]!);
      act(() => vi.advanceTimersByTime(9000));
      expect(bubble).toHaveTextContent(messages[0]!);
      unmount();

      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
      renderRestaurant();
      act(() => vi.advanceTimersByTime(9000));
      expect(screen.getByTestId("home-bubble")).toHaveTextContent(messages[0]!);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("puts the map pin reminder first", async () => {
    renderWithProviders(<RestaurantDashboardPage />, {
      route: "/dashboard",
      path: "/dashboard",
      user: makeUser({ role: "RESTAURANT", latitude: null, longitude: null }),
      get: { "/stats/my-impact": IMPACT, "/users/stores": STORES },
    });

    const reminder = await screen.findByRole("link", { name: t("location.reminderLink") });
    expect(reminder.compareDocumentPosition(screen.getByTestId("home-hero")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides the slider without stores, and when the stores fail to load", async () => {
    const { unmount } = renderRestaurant({ stores: { stores: [], total: 0 } });
    await waitFor(() => expect(statValues()[0]).toBe("873,9 kg"));
    await waitFor(() => expect(screen.queryByTestId("home-store-slider")).not.toBeInTheDocument());
    unmount();

    renderRestaurant({ stores: new Error("Network Error") });
    await waitFor(() => expect(statValues()[0]).toBe("873,9 kg"));
    await waitFor(() => expect(screen.queryByTestId("home-store-slider")).not.toBeInTheDocument());
  });

  it("leaves the stats out when they fail to load and keeps the rest of the page", async () => {
    renderRestaurant({ impact: new Error("Network Error") });

    expect(await screen.findByRole("link", { name: "Zeleni Market" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("home-stats")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: t("restaurantHome.hero.shopNow") })).toBeInTheDocument();
  });
});
