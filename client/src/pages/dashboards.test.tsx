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
    expect(paramsOf("/products")).toEqual({ sort: "expiry", limit: 3 });
    expect(paramsOf("/reservations/mine")).toEqual({ limit: 3 });
    expect(statValue(t("dashboard.statSavings"))).toBe("0.00 KM");
  });
});
