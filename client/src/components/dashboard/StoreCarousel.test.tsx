import { fireEvent, screen, within } from "@testing-library/react";
import StoreCarousel from "./StoreCarousel.js";
import { makeUser, renderWithProviders, t } from "../../test/utils.js";

const STORES = [
  makeUser({ id: 21, role: "STORE", business_name: "Zeleni Market", distance_km: 0 }),
  makeUser({ id: 22, role: "STORE", business_name: "Pekara Kod Mirze", distance_km: 16, logo_url: "/uploads/logos/22.png" }),
];

const renderCarousel = (stores: typeof STORES | null) =>
  renderWithProviders(<StoreCarousel stores={stores} />, { route: "/dashboard", path: "/dashboard" });

describe("StoreCarousel", () => {
  it("links each store card to its page with the name and distance, and ends with All stores", () => {
    renderCarousel(STORES);

    const region = screen.getByRole("region", { name: t("storeCarousel.title") });
    const links = within(region).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/stores/21", "/stores/22", "/stores"]);
    // The logo is decorative inside the link: the name is read once.
    expect(links[0]).toHaveAccessibleName("Zeleni Market 0 km");
    expect(links[1]).toHaveAccessibleName("Pekara Kod Mirze 16 km");
    expect(links.at(-1)).toHaveAccessibleName(t("storeCarousel.allStores"));
    expect(links.at(-1)).toHaveAttribute("data-testid", "store-card-all");
    expect(within(region).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows skeleton cards while loading, without the All stores card", () => {
    renderCarousel(null);

    expect(screen.getByTestId("store-carousel")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("store-card-skeleton")).toHaveLength(6);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("has previous and next buttons that scroll the track by about two cards", () => {
    renderCarousel(STORES);

    const track = screen.getByTestId("store-carousel-track");
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy;
    fireEvent.click(screen.getByRole("button", { name: t("storeCarousel.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("storeCarousel.previous") }));
    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(scrollBy.mock.calls[0]![0].left).toBeGreaterThanOrEqual(0);
    expect(scrollBy.mock.calls[1]![0].left).toBeLessThanOrEqual(0);
    // The buttons control the track.
    expect(screen.getByRole("button", { name: t("storeCarousel.next") })).toHaveAttribute("aria-controls", track.id);
  });
});
