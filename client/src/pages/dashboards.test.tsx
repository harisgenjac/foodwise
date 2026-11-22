import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import StoreDashboardPage from "./StoreDashboardPage.js";
import RestaurantDashboardPage from "./RestaurantDashboardPage.js";
import toast from "react-hot-toast";
import AppToaster from "../components/AppToaster.js";
import { CartProvider } from "../context/CartContext.js";
import { apiMock, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";

const paramsOf = (url: string) => apiMock.get.mock.calls.find(([called]) => called === url)?.[1]?.params;
const statValues = () => screen.getAllByTestId("home-stat-value").map((node) => node.textContent);

describe("StoreDashboardPage", () => {
  const IMPACT = { impact: { food_kg: 412.6, co2_kg: 1031.5, revenue: 2318.4 } };
  const renderStore = ({ impact = IMPACT as object | Error, user = {} } = {}) =>
    renderWithProviders(<StoreDashboardPage />, {
      route: "/dashboard",
      path: "/dashboard",
      user: makeUser({ role: "STORE", latitude: 43.85, longitude: 18.41, ...user }),
      get: {
        "/stats/my-impact": impact,
        "/stats/store-home": { today: { pending: 0, first_deadline: null, to_prepare: 0, first_ready_at: null, hand_over_courier: 0, hand_over_pickup: 0, expiring_today: 0 }, orders: [], products: [] },
      },
    });

  it("shows the hero (the brand as the only h1, the store text, Add product, Orders, the shopkeeper) with the store's stats", async () => {
    renderStore();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Još vrijedi" })).toBeInTheDocument();
    expect(screen.getByText(t("storeHome.hero.text"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dodaj proizvod" })).toHaveAttribute("href", "/add-product");
    expect(screen.getByRole("link", { name: "Narudžbe" })).toHaveAttribute("href", "/orders");
    expect(screen.getByRole("img", { name: "Prodavač drži gajbu punu povrća" })).toBeInTheDocument();
    expect(screen.queryByTestId("home-chef")).not.toBeInTheDocument();

    // The store's own numbers, formatted for Bosnian; the third is "Vraćeno u kasu" (back in the till).
    await waitFor(() => expect(statValues()).toEqual(["412,6 kg", "1.031,5 kg", "2.318,40 KM"]));
    const stats = screen.getByRole("group", { name: t("home.stats.label") });
    expect(within(stats).getByRole("button", { name: t("storeHome.stats.revenueInfo") })).toHaveAccessibleDescription(
      `${t("storeHome.stats.revenue")} ${t("storeHome.stats.revenueTip")}`,
    );
    expect(within(stats).getByRole("button", { name: t("home.stats.foodSavedInfo") })).toHaveAccessibleDescription(
      `${t("home.stats.foodSaved")} ${t("storeHome.stats.foodSavedTip")}`,
    );
    // The stats and the store home data (Danas and the two lists) in two requests.
    expect(apiMock.get.mock.calls.map(([url]) => url).filter((url) => url !== "/users/me").sort()).toEqual([
      "/stats/my-impact",
      "/stats/store-home",
    ]);
  });

  it("shows zeros to a store that has sold nothing yet", async () => {
    renderStore({ impact: { impact: { food_kg: 0, co2_kg: 0, revenue: 0 } } });

    await waitFor(() => expect(statValues()).toEqual(["0,0 kg", "0,0 kg", "0,00 KM"]));
  });

  it("shows pulse bars while loading and leaves the stats out when they fail, keeping the rest of the page", async () => {
    renderStore({ impact: new Error("Network Error") });

    expect(screen.getByTestId("home-stats")).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(screen.queryByTestId("home-stats")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Dodaj proizvod" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: t("storeHome.howItWorks.title") })).toBeInTheDocument();
  });

  it("opens a stat's tooltip on hover and focus and closes it on Escape", async () => {
    renderStore();
    const button = await screen.findByRole("button", { name: t("storeHome.stats.revenueInfo") });
    const tip = screen
      .getAllByRole("tooltip", { hidden: true })
      .find((node) => node.textContent?.includes(t("storeHome.stats.revenueTip")))!;
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

  it("changes the shopkeeper's message every 3 seconds, and keeps the first one with reduced motion", () => {
    vi.useFakeTimers();
    try {
      const messages = t("storeHome.hero.bubble", { returnObjects: true }) as unknown as string[];
      expect(messages).toHaveLength(4);
      const { unmount } = renderStore();
      const bubble = screen.getByTestId("home-bubble");
      expect(bubble).toHaveAttribute("aria-live", "polite");
      expect(bubble).toHaveTextContent("Bolje popust nego otpad!");
      act(() => vi.advanceTimersByTime(3000));
      expect(bubble).toHaveTextContent(messages[1]!);
      act(() => vi.advanceTimersByTime(9000));
      expect(bubble).toHaveTextContent(messages[0]!);
      unmount();

      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
      renderStore();
      act(() => vi.advanceTimersByTime(9000));
      expect(screen.getByTestId("home-bubble")).toHaveTextContent(messages[0]!);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("puts the map pin reminder right under the hero", async () => {
    renderStore({ user: { latitude: null, longitude: null } });

    const reminder = await screen.findByRole("link", { name: t("location.reminderLink") });
    expect(screen.getByTestId("home-hero").compareDocumentPosition(reminder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("ends with From the shelf to the restaurant and the donation band", () => {
    renderStore();
    const how = screen.getByRole("region", { name: "Od police do restorana" });
    expect(within(how).getByText("Tri koraka do prodaje umjesto bacanja")).toBeInTheDocument();
    expect(within(how).getAllByRole("heading", { level: 3 }).map((node) => node.textContent)).toEqual([
      "Objavite ponudu",
      "Potvrdite narudžbu",
      "Predajte robu",
    ]);
    expect(within(how).getAllByTestId("how-it-works-highlight").map((node) => node.textContent)).toEqual([
      "Jedna objava košta 1 kredit",
      "prihvatite ili odbijete u par klikova",
      "preuzme lično ili je odnese kurir",
    ]);

    const band = screen.getByRole("region", { name: t("home.donate.title") });
    expect(within(band).getByText(t("storeHome.donate.text"))).toBeInTheDocument();
    expect(within(band).getByRole("link", { name: "Doniraj hranu" })).toHaveAttribute("href", "/donate-food");
    expect(within(band).getByRole("link", { name: "Budi sponzor" })).toHaveAttribute("href", "/sponsor");
    expect(screen.getByTestId("home-hero").compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(how.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
  const OFFERS = {
    stores: [
      {
        id: 31,
        business_name: "Bingo Sarajevo Centar",
        logo_url: null,
        company_name: "Bingo d.o.o.",
        city: "Sarajevo",
        distance_km: 0.84,
        offer_count: 11,
        is_favorite: true,
        products: [
          makeProduct({ id: 101, store_id: 31, name: "Sir trapist", days_until_expiry: 1, original_price: "13.70", discounted_price: "7.20", available_quantity: "5", unit: "kg" }),
          makeProduct({ id: 102, store_id: 31, name: "Hljeb bijeli", days_until_expiry: 2, original_price: "1.60", discounted_price: "0.70", available_quantity: "39", unit: "kom" }),
          makeProduct({ id: 103, store_id: 31, name: "Kroasani", days_until_expiry: 0, unit: "pak" }),
          makeProduct({ id: 104, store_id: 31, name: "Zelena salata", days_until_expiry: 5, unit: "kom" }),
        ],
      },
      {
        id: 32,
        business_name: "Zelena Market",
        logo_url: null,
        company_name: null,
        city: "Visoko",
        distance_km: null,
        offer_count: 1,
        is_favorite: false,
        products: [makeProduct({ id: 105, store_id: 32, name: "Paradajz", days_until_expiry: 3 })],
      },
    ],
  };
  const renderRestaurant = ({
    impact = IMPACT as object | Error,
    stores = STORES as object | Error,
    offers = OFFERS as object | Error,
    withToaster = false,
  } = {}) =>
    renderWithProviders(
      <CartProvider enabled>
        {withToaster && <AppToaster />}
        <RestaurantDashboardPage />
      </CartProvider>,
      {
        route: "/dashboard",
        path: "/dashboard",
        user: makeUser({ role: "RESTAURANT", latitude: 43.98, longitude: 18.17 }),
        get: { "/stats/my-impact": impact, "/users/stores": stores, "/products/home": offers },
      },
    );
  const pageUrls = () => apiMock.get.mock.calls.map(([url]) => url).filter((url) => url !== "/users/me").sort();

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
    const stats = screen.getByRole("group", { name: t("home.stats.label") });
    expect(within(stats).getByRole("button", { name: t("home.stats.co2Info") })).toHaveAccessibleDescription(
      `${t("home.stats.co2")} ${t("home.stats.co2Tip")}`,
    );

    // The slider: the stores' visibility rules, nearest first, from all cities, at most 20; each
    // card links to its store.
    const slider = screen.getByRole("region", { name: t("restaurantHome.stores.label") });
    expect(await within(slider).findByRole("link", { name: "Zeleni Market" })).toHaveAttribute("href", "/stores/21");
    expect(within(slider).getByRole("link", { name: "Pekara Kod Mirze" })).toHaveAttribute("href", "/stores/22");
    expect(paramsOf("/users/stores")).toEqual({ radius: "all", limit: 20 });
    expect(pageUrls()).toEqual(["/cart", "/products/home", "/stats/my-impact", "/users/stores"]);
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

  it("puts the map pin reminder right under the hero", async () => {
    renderWithProviders(<RestaurantDashboardPage />, {
      route: "/dashboard",
      path: "/dashboard",
      user: makeUser({ role: "RESTAURANT", latitude: null, longitude: null }),
      get: { "/stats/my-impact": IMPACT, "/users/stores": STORES, "/products/home": OFFERS },
    });

    const reminder = await screen.findByRole("link", { name: t("location.reminderLink") });
    expect(screen.getByTestId("home-hero").compareDocumentPosition(reminder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("shows a row per store: name, city and distance, the chain chip and All (N) to the store page", async () => {
    renderRestaurant();
    const section = await screen.findByRole("region", { name: t("restaurantHome.offers.title") });
    const rows = await within(section).findAllByTestId("home-store-row");
    expect(rows).toHaveLength(2);

    const bingo = within(rows[0]!);
    expect(bingo.getByRole("heading", { level: 3, name: "Bingo Sarajevo Centar" })).toBeInTheDocument();
    expect(bingo.getByText("Sarajevo · 0,8 km")).toBeInTheDocument();
    expect(bingo.getByText("dio Bingo d.o.o.")).toBeInTheDocument();
    const all = bingo.getByRole("link", { name: "Sve ponude prodavnice Bingo Sarajevo Centar (11)" });
    expect(all).toHaveAttribute("href", "/stores/31");
    expect(all).toHaveTextContent("Sve (11)");

    // Without a pin on either side only the city; no chip for an independent store.
    const zelena = within(rows[1]!);
    expect(zelena.getByText("Visoko")).toBeInTheDocument();
    expect(zelena.queryByText(/^dio /)).not.toBeInTheDocument();
  });

  it("shows each offer: discount, expiry (today and tomorrow in red), what is left and the prices, and links the card to the product", async () => {
    renderRestaurant();
    const [row] = await screen.findAllByTestId("home-store-row");
    const cards = within(row!).getAllByTestId("home-offer");
    expect(cards).toHaveLength(4);

    const cheese = within(cards[0]!);
    expect(cheese.getByRole("link", { name: "Sir trapist" })).toHaveAttribute("href", "/products/101");
    expect(cheese.getByText("−47%")).toBeInTheDocument();
    expect(cheese.getByTestId("home-offer-expiry")).toHaveTextContent("Sutra");
    expect(cheese.getByTestId("home-offer-expiry")).toHaveClass("text-danger-700");
    expect(cheese.getByText("Dostupno: 5 kg")).toBeInTheDocument();
    expect(cheese.getByText("7,20 KM")).toBeInTheDocument();
    expect(cheese.getByText("13,70 KM")).toHaveClass("line-through");

    expect(within(cards[1]!).getByTestId("home-offer-expiry")).toHaveTextContent("Za 2 dana");
    expect(within(cards[1]!).getByTestId("home-offer-expiry")).toHaveClass("text-neutral-600");
    expect(within(cards[2]!).getByTestId("home-offer-expiry")).toHaveTextContent("Danas");
    expect(within(cards[3]!).getByTestId("home-offer-expiry")).toHaveTextContent("Za 5 dana");
  });

  it("opens the add-to-cart dialog for the product with +", async () => {
    renderRestaurant();
    fireEvent.click(await screen.findByRole("button", { name: t("stepper.add", { name: "Hljeb bijeli" }) }));

    const dialog = await screen.findByRole("dialog", { name: t("cart.addTitle") });
    expect(within(dialog).getByText("Hljeb bijeli")).toBeInTheDocument();
    // Still on the home page: + does not open the product.
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
  });

  it("hides Order now without stores with offers, and when they fail to load", async () => {
    const { unmount } = renderRestaurant({ offers: { stores: [] } });
    await waitFor(() => expect(statValues()[0]).toBe("873,9 kg"));
    await waitFor(() => expect(screen.queryByTestId("home-offers")).not.toBeInTheDocument());
    unmount();

    renderRestaurant({ offers: new Error("Network Error") });
    await waitFor(() => expect(screen.queryByTestId("home-offers")).not.toBeInTheDocument());
    expect(screen.getByRole("region", { name: t("restaurantHome.howItWorks.title") })).toBeInTheDocument();
  });

  it("ends with From the shelf to your kitchen and the donation band", async () => {
    renderRestaurant();
    const how = screen.getByRole("region", { name: t("restaurantHome.howItWorks.title") });
    expect(within(how).getByText(t("restaurantHome.howItWorks.subtitle"))).toBeInTheDocument();
    expect(within(how).getAllByRole("heading", { level: 3 }).map((node) => node.textContent)).toEqual([
      "Pronađite ponudu",
      "Izaberite preuzimanje",
      "Kuhajte već danas",
    ]);
    expect(within(how).getAllByTestId("how-it-works-highlight").map((node) => node.textContent)).toEqual([
      "po nižoj cijeni",
      "lično u prodavnici ili je primite dostavom",
      "spremna za vašu kuhinju",
    ]);

    const band = screen.getByRole("region", { name: t("home.donate.title") });
    expect(within(band).getByRole("link", { name: "Doniraj obrok" })).toHaveAttribute("href", "/donate-food");
    expect(within(band).getByRole("link", { name: "Budi sponzor" })).toHaveAttribute("href", "/sponsor");
    expect(how.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await screen.findAllByTestId("home-store-row")).toHaveLength(2);
    expect(screen.getByTestId("home-offers").compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
