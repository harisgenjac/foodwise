import { screen, within } from "@testing-library/react";
import StoreDashboardPage from "./StoreDashboardPage.js";
import RestaurantDashboardPage from "./RestaurantDashboardPage.js";
import { apiMock, makeProduct, makeReservation, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { RestaurantDashboardStats, StoreDashboardStats } from "../types/index.js";

// The value printed under a stat card's label (the label is the card's first, truncated line).
const statValue = (label: string) =>
  screen.getByText(label, { selector: "p.truncate" }).nextElementSibling?.textContent;

// The unit chips under a stat card's value (the shared UnitChips component).
const chipsOf = (label: string) => {
  const card = screen.getByText(label, { selector: "p.truncate" }).parentElement!;
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
        // A single Pending reservation: the cards must not be computed from this page of the list.
        "/reservations/store": { reservations: [makeReservation({ id: 9, product_name: "Jogurt" })], total: 30 },
      },
    });

  it("shows the server's numbers on the stat cards", async () => {
    renderStore({
      active_products: 17,
      pending_reservations: 4,
      successful_reservations: 25,
      saved: { kg: 12.5, l: 3, pieces: 8 },
    });

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(statValue(t("dashboard.statActiveProducts"))).toBe("17");
    expect(statValue(t("dashboard.statPending"))).toBe("4");
    expect(statValue(t("dashboard.statConfirmed"))).toBe("25");
    expect(statValue(t("dashboard.statSavedFood"))).toBe("12.5 kg");
    expect(chipsOf(t("dashboard.statSavedFood"))).toEqual(["3 l", `8 ${t("dashboard.piecesShort")}`]);
  });

  it("shows the other non-zero units of food saved as chips", async () => {
    renderStore({ active_products: 0, pending_reservations: 0, successful_reservations: 0, saved: { kg: 0, l: 12, pieces: 40 } });

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(statValue(t("dashboard.statSavedFood"))).toBe("12 l");
    expect(chipsOf(t("dashboard.statSavedFood"))).toEqual([`40 ${t("dashboard.piecesShort")}`]);
  });

  it("shows no chips when food was saved in a single unit", async () => {
    renderStore({ active_products: 0, pending_reservations: 0, successful_reservations: 0, saved: { kg: 5, l: 0, pieces: 0 } });

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(statValue(t("dashboard.statSavedFood"))).toBe("5 kg");
    expect(screen.queryByTestId("unit-chips")).not.toBeInTheDocument();
  });

  it("asks only for the 3 newest available products and reservations", async () => {
    renderStore({ active_products: 0, pending_reservations: 0, successful_reservations: 0, saved: { kg: 0, l: 0, pieces: 0 } });

    expect(await screen.findByText("Jogurt")).toBeInTheDocument();
    expect(screen.getByText("Sir")).toBeInTheDocument();
    expect(paramsOf("/products/mine")).toEqual({ status: "Available", limit: 3 });
    expect(paramsOf("/reservations/store")).toEqual({ limit: 3 });
    expect(statValue(t("dashboard.statSavedFood"))).toBe("0 kg");
  });

  it("shows zeros when the stats cannot be loaded", async () => {
    renderStore(new Error("Network Error"));

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(statValue(t("dashboard.statActiveProducts"))).toBe("0");
    expect(statValue(t("dashboard.statSavedFood"))).toBe("0 kg");
  });

  it("titles the reservations section Recent reservations", async () => {
    renderStore({ active_products: 0, pending_reservations: 0, successful_reservations: 0, saved: { kg: 0, l: 0, pieces: 0 } });

    expect(await screen.findByRole("heading", { name: t("dashboard.recentReservationsTitle") })).toHaveTextContent(
      "Nedavne rezervacije",
    );
    expect(screen.queryByRole("heading", { name: t("dashboard.myReservationsTitle") })).not.toBeInTheDocument();
  });
});

describe("RestaurantDashboardPage", () => {
  const renderRestaurant = (stats: RestaurantDashboardStats) =>
    renderWithProviders(<RestaurantDashboardPage />, {
      route: "/dashboard",
      path: "/dashboard",
      user: makeUser({ role: "RESTAURANT" }),
      get: {
        "/dashboard/stats": { stats },
        "/products": { products: [makeProduct({ id: 1, name: "Hljeb" })], total: 58 },
        "/reservations/mine": {
          reservations: [makeReservation({ id: 9, product_name: "Jogurt", status: "Confirmed" })],
          total: 12,
        },
      },
    });

  it("shows the server's numbers and the marketplace total on the stat cards", async () => {
    renderRestaurant({ pending_reservations: 3, successful_reservations: 21, savings: 146.5 });

    expect(await screen.findByText("Jogurt")).toBeInTheDocument();
    expect(statValue(t("dashboard.statAvailableOffers"))).toBe("58");
    expect(statValue(t("dashboard.statPending"))).toBe("3");
    expect(statValue(t("dashboard.statConfirmed"))).toBe("21");
    expect(statValue(t("dashboard.statSavings"))).toBe("146.50 KM");
  });

  it("asks for the 3 offers closest to expiry and the 3 latest reservations", async () => {
    renderRestaurant({ pending_reservations: 0, successful_reservations: 0, savings: 0 });

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(paramsOf("/products")).toEqual({ sort: "expiry", radius: "10", limit: 3 });
    expect(paramsOf("/reservations/mine")).toEqual({ limit: 3 });
    expect(statValue(t("dashboard.statSavings"))).toBe("0.00 KM");
  });

  it("titles the reservations section My reservations, like the page its link opens", async () => {
    renderRestaurant({ pending_reservations: 0, successful_reservations: 0, savings: 0 });

    expect(await screen.findByRole("heading", { name: t("dashboard.myReservationsTitle") })).toHaveTextContent(
      "Moje rezervacije",
    );
    expect(screen.queryByRole("heading", { name: t("dashboard.recentReservationsTitle") })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: t("dashboard.viewAllReservations") })).toHaveAttribute("href", "/my-reservations");
  });

  describe("offers closest to expiry, nearby first", () => {
    const VISOKO = makeProduct({ id: 1, name: "Hljeb", city: "Visoko", distance_km: 0 });
    const KAKANJ = makeProduct({ id: 2, name: "Mlijeko", city: "Kakanj", distance_km: 16 });
    const ZENICA = makeProduct({ id: 3, name: "Sir", city: "Zenica", distance_km: 32 });
    const TUZLA = makeProduct({ id: 4, name: "Jaja", city: "Tuzla", distance_km: 73 });
    // The server's answer per radius, sorted by expiry (the far ones expire sooner here, so a
    // wider result lists them before the near one).
    const BY_RADIUS: Record<string, { products: typeof VISOKO[]; outside: number }> = {
      "10": { products: [VISOKO], outside: 3 },
      "20": { products: [KAKANJ, VISOKO], outside: 2 },
      "50": { products: [ZENICA, KAKANJ, VISOKO], outside: 1 },
      all: { products: [TUZLA, ZENICA, KAKANJ, VISOKO], outside: 0 },
    };
    const renderOffers = (byRadius: Record<string, { products: typeof VISOKO[]; outside: number }>) =>
      renderWithProviders(<RestaurantDashboardPage />, {
        route: "/dashboard",
        path: "/dashboard",
        user: makeUser({ role: "RESTAURANT" }),
        get: {
          "/dashboard/stats": { stats: { pending_reservations: 0, successful_reservations: 0, savings: 0 } },
          "/products": ({ radius, limit }: { radius: string; limit: number }) => ({
            products: byRadius[radius]!.products.slice(0, limit),
            total: byRadius[radius]!.products.length,
            outside_radius_count: byRadius[radius]!.outside,
          }),
          "/reservations/mine": { reservations: [], total: 0 },
        },
      });
    const productRadii = () =>
      apiMock.get.mock.calls
        .filter(([url]) => url === "/products")
        .map(([, config]) => config?.params as { radius: string; limit: number; sort: string });

    it("asks once when 10 km has three offers", async () => {
      renderOffers({ "10": { products: [VISOKO, KAKANJ, ZENICA, TUZLA], outside: 5 } });
      expect(await screen.findByText("Sir")).toBeInTheDocument();
      expect(productRadii()).toEqual([{ sort: "expiry", radius: "10", limit: 3 }]);
      expect(statValue(t("dashboard.statAvailableOffers"))).toBe("4");
    });

    it("keeps the nearby offer first and fills the rest from the next radii", async () => {
      renderOffers(BY_RADIUS);
      expect(await screen.findByText("Sir")).toBeInTheDocument();
      expect(productRadii()).toEqual([
        { sort: "expiry", radius: "10", limit: 3 },
        { sort: "expiry", radius: "20", limit: 4 },
        { sort: "expiry", radius: "50", limit: 5 },
      ]);
      expect(screen.getAllByText(/·/).map((line) => line.textContent)).toEqual([
        "· Visoko · u vašem gradu",
        "· Kakanj · 16 km",
        "· Zenica · 32 km",
      ]);
      expect(screen.queryByText("Jaja")).not.toBeInTheDocument();
      // The count covers the widest radius asked for.
      expect(statValue(t("dashboard.statAvailableOffers"))).toBe("3");
    });

    it("goes on to all cities when nothing is nearer", async () => {
      const empty = { products: [], outside: 1 };
      renderOffers({ "10": empty, "20": empty, "50": empty, all: { products: [TUZLA], outside: 0 } });
      expect(await screen.findByText("Jaja")).toBeInTheDocument();
      expect(productRadii().map((params) => params.radius)).toEqual(["10", "20", "50", "all"]);
      expect(statValue(t("dashboard.statAvailableOffers"))).toBe("1");
    });

    it("stops when nothing lies further away and shows the empty message", async () => {
      renderOffers({ "10": { products: [], outside: 0 } });
      expect(await screen.findByText(t("dashboard.noProducts"))).toBeInTheDocument();
      expect(productRadii()).toEqual([{ sort: "expiry", radius: "10", limit: 3 }]);
      expect(statValue(t("dashboard.statAvailableOffers"))).toBe("0");
    });
  });
});
