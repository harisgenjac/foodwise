import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import StoresPage from "./StoresPage.js";
import { apiMock, axiosError, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { User } from "../types/index.js";

const store = (id: number, business_name: string, overrides: Partial<User> = {}): User =>
  makeUser({ id, role: "STORE", business_name, city: "Sarajevo", active_products: "2", max_discount: 40, ...overrides });

// A restaurant in Sarajevo (city 1 in the test city list).
const RESTAURANT = makeUser({ city_id: 1 });

type Params = { business_name: string; city_id: string; favorites: string; radius: string };

const renderPage = ({
  stores = (_params: Params) => ({ stores: [store(1, "Prva"), store(2, "Druga")], total: 2, outside_radius_count: 0 }),
  favorites = [] as number[],
}: { stores?: (params: Params) => unknown; favorites?: number[] } = {}) =>
  renderWithProviders(<StoresPage />, {
    route: "/stores",
    path: "/stores",
    user: RESTAURANT,
    get: {
      "/favorites": () => ({ favorites: favorites.map((id) => ({ id })) }),
      "/users/stores": stores,
    },
  });

const lastParams = () => apiMock.get.mock.calls.filter(([url]) => url === "/users/stores").at(-1)?.[1]?.params as Params;
const cardNames = () => screen.getAllByTestId("store-card").map((card) => within(card).getByRole("heading").textContent);
const openFilters = async () => {
  await userEvent.click(screen.getByRole("button", { name: /^Filteri/ }));
  return screen.getByRole("dialog", { name: t("listFilters.title") });
};

describe("StoresPage", () => {
  it("lists the stores nearest first, in the server's order, with the default 10 km", async () => {
    renderPage({
      stores: () => ({
        stores: [store(3, "Blizu", { distance_km: 0.4 }), store(1, "Srednje", { distance_km: 2.1 }), store(2, "Daleko", { distance_km: 8 })],
        total: 3,
      }),
    });
    await screen.findByText("Blizu");
    expect(cardNames()).toEqual(["Blizu", "Srednje", "Daleko"]);
    expect(lastParams()).toMatchObject({ radius: "10", favorites: "" });
    expect(lastParams()).not.toHaveProperty("sort");
  });

  it("shows the chain or the independent chip on every card", async () => {
    renderPage({
      stores: () => ({ stores: [store(1, "Bingo Visoko", { company_name: "Bingo d.o.o." }), store(2, "Market")], total: 2 }),
    });
    await screen.findByText("Market");
    expect(screen.getAllByTestId("store-kind").map((chip) => chip.textContent)).toEqual([
      t("store.chainLabel", { company: "Bingo d.o.o." }),
      t("store.independent"),
    ]);
  });

  it("flips the heart at once and adds the store to the favourites without a toast", async () => {
    let resolve: () => void = () => {};
    apiMock.post.mockImplementation(() => new Promise((done) => (resolve = () => done({ data: {} }))));
    const success = vi.spyOn(toast, "success");
    renderPage();
    const card = (await screen.findByText("Prva")).closest("article")!;
    await userEvent.click(within(card).getByRole("button", { name: t("store.addToFavorites") }));
    // Before the server answers.
    expect(within(card).getByRole("button", { name: t("store.removeFromFavorites") })).toHaveAttribute("aria-pressed", "true");
    expect(apiMock.post).toHaveBeenCalledWith("/favorites", { store_id: 1 });
    expect(screen.getByTestId("favorites-count")).toHaveTextContent("1");
    resolve();
    expect(success).not.toHaveBeenCalled();
  });

  it("puts the heart back and shows the server's reason when it fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.post.mockRejectedValue(axiosError(400, "Store is already in favorites."));
    const errorToast = vi.spyOn(toast, "error");
    renderPage();
    const card = (await screen.findByText("Prva")).closest("article")!;
    await userEvent.click(within(card).getByRole("button", { name: t("store.addToFavorites") }));
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Store is already in favorites."));
    expect(within(card).getByRole("button", { name: t("store.addToFavorites") })).toHaveAttribute("aria-pressed", "false");
  });

  it("asks for the favourites on the Omiljene tab, with their count and without the radius", async () => {
    renderPage({
      favorites: [2],
      stores: (params) => ({ stores: params.favorites === "true" ? [store(2, "Druga")] : [store(1, "Prva"), store(2, "Druga")] }),
    });
    await screen.findByText("Prva");
    const tab = screen.getByRole("button", { name: /^Omiljene/ });
    await waitFor(() => expect(within(tab).getByTestId("favorites-count")).toHaveTextContent("1"));
    await userEvent.click(tab);
    await waitFor(() => expect(screen.queryByText("Prva")).not.toBeInTheDocument());
    expect(tab).toHaveAttribute("aria-pressed", "true");
    expect(lastParams()).toMatchObject({ favorites: "true" });
    expect(screen.queryAllByTestId("active-filter")).toHaveLength(0);
  });

  it("shows the active filters as chips; × removes one and Očisti goes back to the defaults", async () => {
    renderPage();
    await screen.findByText("Prva");
    expect(screen.getAllByTestId("active-filter").map((chip) => chip.textContent)).toEqual(["Do 10 km"]);
    expect(screen.getByTestId("filter-count")).toHaveTextContent("1");

    await userEvent.type(screen.getByPlaceholderText(t("store.searchPlaceholder")), "Pr");
    const drawer = await openFilters();
    await userEvent.selectOptions(within(drawer).getByLabelText(t("listFilters.city")), "Sarajevo");
    await userEvent.click(within(drawer).getByRole("button", { name: t("listFilters.close") }));
    expect(screen.getAllByTestId("active-filter").map((chip) => chip.textContent)).toEqual(["Sarajevo", "Do 10 km"]);
    await waitFor(() => expect(lastParams()).toMatchObject({ business_name: "Pr", city_id: "1", radius: "10" }));

    await userEvent.click(screen.getByRole("button", { name: t("listFilters.remove", { filter: t("radius.label") }) }));
    expect(screen.getAllByTestId("active-filter").map((chip) => chip.textContent)).toEqual(["Sarajevo"]);
    await waitFor(() => expect(lastParams()).toMatchObject({ radius: "all" }));

    await userEvent.click(screen.getByRole("button", { name: t("listFilters.clear") }));
    expect(screen.getByPlaceholderText(t("store.searchPlaceholder"))).toHaveValue("");
    expect(screen.getAllByTestId("active-filter").map((chip) => chip.textContent)).toEqual(["Do 10 km"]);
    await waitFor(() => expect(lastParams()).toMatchObject({ business_name: "", city_id: "", radius: "10" }));
  });

  it("switches the distance to no limit when another city is chosen, and keeps it for the own city", async () => {
    renderPage();
    await screen.findByText("Prva");
    const drawer = await openFilters();
    const city = within(drawer).getByLabelText(t("listFilters.city"));
    await within(drawer).findByRole("option", { name: "Tuzla" });

    await userEvent.selectOptions(city, "Sarajevo");
    expect(within(drawer).getByRole("button", { name: "Do 10 km" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.selectOptions(city, "Tuzla");
    expect(within(drawer).getByRole("button", { name: t("listFilters.noLimit") })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(lastParams()).toMatchObject({ city_id: "2", radius: "all" }));
  });

  it("closes the filter panel on Escape and on the overlay", async () => {
    renderPage();
    await screen.findByText("Prva");
    await openFilters();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openFilters();
    await userEvent.click(screen.getByTestId("filter-drawer-overlay"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("tells how many stores lie further away and widens to the next radius", async () => {
    renderPage({
      stores: (params) =>
        params.radius === "20"
          ? { stores: [store(1, "Prva"), store(2, "Kakanj")], total: 2, outside_radius_count: 0 }
          : { stores: [store(1, "Prva")], total: 1, outside_radius_count: 11 },
    });
    expect(await screen.findByText("Još 11 prodavnica je dalje od 10 km.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Prikaži do 20 km" }));
    expect(await screen.findByText("Kakanj")).toBeInTheDocument();
    expect(screen.queryByTestId("more-stores")).not.toBeInTheDocument();
  });

  it("has no hint without a limit", async () => {
    renderPage({ stores: () => ({ stores: [store(1, "Prva")], total: 1, outside_radius_count: 0 }) });
    await screen.findByText("Prva");
    expect(screen.queryByTestId("more-stores")).not.toBeInTheDocument();
  });

  it("offers to clear the filters when nothing matches them", async () => {
    renderPage({ stores: (params) => (params.business_name ? { stores: [], total: 0 } : { stores: [store(1, "Prva")], total: 1 }) });
    await screen.findByText("Prva");
    await userEvent.type(screen.getByPlaceholderText(t("store.searchPlaceholder")), "xyz");
    const empty = await screen.findByTestId("stores-empty");
    expect(within(empty).getByText(t("store.noResultsTitle"))).toBeInTheDocument();
    await userEvent.click(within(empty).getByRole("button", { name: t("filters.clear") }));
    expect(await screen.findByText("Prva")).toBeInTheDocument();
  });

  it("says when there are no favourites yet", async () => {
    renderPage({ stores: (params) => (params.favorites === "true" ? { stores: [], total: 0 } : { stores: [store(1, "Prva")], total: 1 }) });
    await screen.findByText("Prva");
    await userEvent.click(screen.getByRole("button", { name: /^Omiljene/ }));
    const empty = await screen.findByTestId("stores-empty");
    expect(within(empty).getByText(t("store.noFavoritesTitle"))).toBeInTheDocument();
    expect(within(empty).getByText(t("store.noFavoritesSubtitle"))).toBeInTheDocument();
  });
});
