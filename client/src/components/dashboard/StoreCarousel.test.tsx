import { act, screen, within } from "@testing-library/react";
import StoreCarousel, { storeTone } from "./StoreCarousel.js";
import { makeUser, renderWithProviders, t } from "../../test/utils.js";
import i18n from "../../i18n/config.js";

const STORES = [
  makeUser({ id: 21, role: "STORE", business_name: "Zeleni Market", city: "Sarajevo", distance_km: 0, active_products: "14" }),
  makeUser({
    id: 22,
    role: "STORE",
    business_name: "Pekara Kod Mirze",
    city: "Kakanj",
    distance_km: 16,
    active_products: "0",
    logo_url: "/uploads/logos/22.png",
    cover_url: "/uploads/covers/22.png",
  }),
];

const renderCarousel = (stores: ReturnType<typeof makeUser>[] | null) =>
  renderWithProviders(<StoreCarousel stores={stores} />, { route: "/dashboard", path: "/dashboard" });

const offersOf = (count: number) => {
  const { unmount } = renderCarousel([
    makeUser({ id: 30 + count, role: "STORE", business_name: "Market", active_products: String(count) }),
  ]);
  const text = screen.getByTestId("store-card-offers").textContent;
  unmount();
  return text;
};

describe("StoreCarousel", () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage("bs"));
  });

  it("links each card to its store with the name, city and distance, and the active offers", () => {
    renderCarousel(STORES);

    const region = screen.getByRole("region", { name: t("storeCarousel.title") });
    expect(within(region).getByText(t("storeCarousel.subtitle"))).toBeInTheDocument();
    const cards = within(region).getAllByTestId("store-card");
    expect(cards.map((card) => card.getAttribute("href"))).toEqual(["/stores/21", "/stores/22"]);
    // The logo and cover are decorative inside the link: the name is read once.
    expect(cards[0]).toHaveAccessibleName("Zeleni Market Sarajevo · 0 km 14 ponuda");
    // No offers: no chip.
    expect(cards[1]).toHaveAccessibleName("Pekara Kod Mirze Kakanj · 16 km");
    expect(within(cards[1]!).queryByTestId("store-card-offers")).not.toBeInTheDocument();
    // The old "All stores" card is gone: the header link replaces it.
    expect(within(region).getAllByRole("listitem")).toHaveLength(2);
    expect(within(region).getByRole("link", { name: t("storeCarousel.allStores") })).toHaveAttribute("href", "/stores");
  });

  it("shows the cover image when the store has one, and otherwise its tone with an icon", () => {
    renderCarousel(STORES);

    const [plain, withCover] = screen.getAllByTestId("store-card-cover");
    expect(withCover!.tagName).toBe("IMG");
    expect(withCover).toHaveAttribute("src", expect.stringContaining("/uploads/covers/22.png"));
    expect(withCover).toHaveAttribute("draggable", "false");
    expect(plain!.tagName).toBe("SPAN");
    expect(plain).toHaveStyle({ backgroundColor: storeTone(21).soft });
    // Without a logo, the initials sit on the stronger colour.
    expect(screen.getByText("ZM")).toHaveStyle({ backgroundColor: storeTone(21).strong });
  });

  it("picks the same tone for the same store", () => {
    expect(storeTone(21)).toBe(storeTone(21));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((id) => storeTone(id).soft)).size).toBeGreaterThan(1);
  });

  it("uses the Bosnian plural forms for the offers", () => {
    expect(offersOf(1)).toBe("1 ponuda");
    expect(offersOf(2)).toBe("2 ponude");
    expect(offersOf(4)).toBe("4 ponude");
    expect(offersOf(5)).toBe("5 ponuda");
    expect(offersOf(14)).toBe("14 ponuda");
    expect(offersOf(22)).toBe("22 ponude");
  });

  it("uses the English plural forms and number format in English", async () => {
    await act(() => i18n.changeLanguage("en"));
    renderCarousel([
      makeUser({ id: 40, role: "STORE", business_name: "Market", city: "Visoko", distance_km: 1200, active_products: "1" }),
    ]);
    expect(screen.getByTestId("store-card")).toHaveAccessibleName("Market Visoko · 1,200 km 1 offer");
  });

  it("shows skeleton cards while loading", () => {
    renderCarousel(null);

    expect(screen.getByTestId("store-carousel")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("store-card-skeleton")).toHaveLength(6);
    expect(screen.queryByTestId("store-card")).not.toBeInTheDocument();
  });
});
