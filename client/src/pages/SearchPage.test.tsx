import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import SearchPage from "./SearchPage.js";
import { CartProvider } from "../context/CartContext.js";
import { apiMock, makeCart, makeCartLine, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { Cart, SearchStore } from "../types/index.js";

const makeStore = (overrides: Partial<SearchStore> = {}): SearchStore => ({
  id: 2,
  business_name: "Market Centar",
  logo_url: null,
  company_name: null,
  city: "Sarajevo",
  distance_km: 2.1,
  match_count: 1,
  orders_paused: false,
  orders_paused_until: null,
  open_now: null,
  closes_at: null,
  opens_at: null,
  opens_on: null,
  products: [makeProduct({ id: 10, store_id: 2, name: "Piletina" })],
  ...overrides,
});

const products = (count: number) =>
  Array.from({ length: count }, (_, i) => makeProduct({ id: 100 + i, name: `Proizvod ${i + 1}` }));

type Answer = { stores: SearchStore[]; total: number; outside_radius_count?: number };
let cart: Cart;

// A restaurant in Sarajevo (city 1 in the test city list).
const RESTAURANT = makeUser({ role: "RESTAURANT", city_id: 1 });

// An Error makes the request fail.
const renderPage = (answer: ((params: Record<string, unknown>) => Answer) | Error, route = "/search") =>
  renderWithProviders(
    <CartProvider enabled>
      <SearchPage />
    </CartProvider>,
    {
      route,
      path: "/search",
      user: RESTAURANT,
      get: {
        "/products/by-store": answer instanceof Error ? answer : (params: unknown) => answer(params as Record<string, unknown>),
        "/cart": () => ({ cart }),
      },
    },
  );

const searchCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/products/by-store");
const lastParams = () => searchCalls().at(-1)?.[1]?.params as Record<string, unknown>;
const chips = () => screen.queryAllByTestId("active-filter").map((chip) => chip.firstChild?.textContent);
const openFilters = async () => {
  await userEvent.click(screen.getByRole("button", { name: /^Filteri/ }));
  return screen.getByRole("dialog", { name: t("listFilters.title") });
};
const clearButton = () => screen.getAllByRole("button", { name: t("listFilters.clear") })[0]!;

const otherStoreError = () =>
  new AxiosError("Request failed", "409", undefined, undefined, {
    status: 409,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: "Your cart has products from another store.", code: "CART_OTHER_STORE", store_name: "Bingo Ilidža" },
  });

beforeEach(() => {
  cart = makeCart([]);
});

describe("SearchPage", () => {
  it("shows one card per store with its initials, distance, city, chip and Sve (N), and no store count", async () => {
    renderPage(() => ({
      stores: [
        makeStore({ match_count: 5 }),
        makeStore({ id: 3, business_name: "Bingo Centar", company_name: "Bingo d.o.o.", products: [makeProduct({ id: 11, name: "Hljeb" })] }),
      ],
      total: 2,
    }));
    const groups = await screen.findAllByTestId("search-store");
    expect(groups).toHaveLength(2);
    const first = within(groups[0]!);
    expect(first.getByRole("heading", { name: "Market Centar" })).toBeInTheDocument();
    expect(first.getByRole("link", { name: "Market Centar" })).toHaveAttribute("href", "/stores/2");
    expect(first.getByText("MC")).toBeInTheDocument();
    expect(first.getByTestId("search-store-place")).toHaveTextContent("2,1 km · Sarajevo");
    expect(first.getByTestId("store-kind")).toHaveTextContent(t("store.independent"));
    const seeAll = first.getByRole("link", { name: t("search.seeAllLabel", { count: 5, store: "Market Centar" }) });
    expect(seeAll).toHaveAttribute("href", "/stores/2");
    expect(seeAll).toHaveTextContent(t("search.seeAll", { count: 5 }));
    expect(within(groups[1]!).getByTestId("store-kind")).toHaveTextContent(t("store.chainLabel", { company: "Bingo d.o.o." }));
    expect(screen.queryByText(/^d+ prodavnic/)).not.toBeInTheDocument();
  });

  it("starts with the 10 km chip, and Očisti removes the search and every filter, the distance too", async () => {
    renderPage(() => ({ stores: [makeStore()], total: 1 }));
    await screen.findByText("Piletina");
    expect(lastParams()).toMatchObject({ sort: "newest", radius: "10", name: "", limit: 12 });
    expect(chips()).toEqual(["Do 10 km"]);
    expect(screen.getByTestId("filter-count")).toHaveTextContent("1");

    await userEvent.type(screen.getByPlaceholderText(t("search.searchPlaceholder")), "mlij");
    await waitFor(() => expect(lastParams()).toMatchObject({ name: "mlij" }));
    await userEvent.click(clearButton());
    await waitFor(() => expect(lastParams()).toMatchObject({ name: "", radius: "all", category: "", expiryWithinDays: "", city_id: "" }));
    expect(chips()).toEqual([]);
    expect(clearButton()).toBeDisabled();
  });

  it("filters by the category and expiry pills, with a chip for each that removes it", async () => {
    renderPage(() => ({ stores: [makeStore()], total: 1 }));
    await screen.findByText("Piletina");
    const drawer = await openFilters();
    const category = within(drawer).getByRole("group", { name: t("search.category") });
    expect(within(category).getAllByRole("button").map((pill) => pill.textContent)).toEqual([
      t("search.allCategories"),
      ...Object.values(t("categories", { returnObjects: true }) as Record<string, string>),
    ]);
    await userEvent.click(within(category).getByRole("button", { name: "Mliječni proizvodi" }));
    const expiry = within(drawer).getByRole("group", { name: t("search.expiry") });
    expect(within(expiry).getAllByRole("button").map((pill) => pill.textContent)).toEqual(["Bilo kada", "Danas", "Do sutra", "Do 3 dana"]);
    await userEvent.click(within(expiry).getByRole("button", { name: "Do sutra" }));
    expect(within(expiry).getByRole("button", { name: "Do sutra" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(lastParams()).toMatchObject({ category: "Dairy", expiryWithinDays: "1" }));

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(chips()).toEqual(["Mliječni proizvodi", "Ističe do sutra", "Do 10 km"]);
    await userEvent.click(screen.getByRole("button", { name: t("listFilters.remove", { filter: t("search.expiry") }) }));
    await waitFor(() => expect(lastParams()).toMatchObject({ category: "Dairy", expiryWithinDays: "" }));
    expect(chips()).toEqual(["Mliječni proizvodi", "Do 10 km"]);
  });

  it("switches the distance to no limit when a city other than the restaurant's is chosen", async () => {
    renderPage(() => ({ stores: [makeStore()], total: 1 }));
    await screen.findByText("Piletina");
    const drawer = await openFilters();
    const city = within(drawer).getByLabelText(t("listFilters.city"));
    await within(city).findByRole("option", { name: "Tuzla" });
    await userEvent.selectOptions(city, "1");
    expect(within(drawer).getByRole("button", { name: "Do 10 km" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.selectOptions(city, "2");
    expect(within(drawer).getByRole("button", { name: t("listFilters.noLimit") })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(lastParams()).toMatchObject({ city_id: "2", radius: "all" }));
    await userEvent.click(within(drawer).getByRole("button", { name: t("listFilters.close") }));
    expect(chips()).toEqual(["Tuzla"]);
  });

  it("sorts with the marketplace sorts, newest first", async () => {
    renderPage(() => ({ stores: [makeStore()], total: 1 }));
    await screen.findByText("Piletina");
    const sort = screen.getByLabelText(t("filters.sortBy"));
    expect(sort).toHaveValue("newest");
    await userEvent.selectOptions(sort, "expiry");
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: "expiry" }));
  });

  it("offers the next radius when more offers lie further away", async () => {
    renderPage(() => ({ stores: [makeStore()], total: 1, outside_radius_count: 56 }));
    const band = await screen.findByTestId("more-offers");
    expect(band).toHaveTextContent("Još 56 ponuda je dalje od 10 km.");
    await userEvent.click(within(band).getByRole("button", { name: "Prikaži do 20 km" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ radius: "20" }));
  });

  it("hides the band with nothing further away", async () => {
    renderPage(() => ({ stores: [makeStore()], total: 1, outside_radius_count: 0 }));
    await screen.findByText("Piletina");
    expect(screen.queryByTestId("more-offers")).not.toBeInTheDocument();
  });

  it("shows every product of a store, as a slider only with more than four", async () => {
    renderPage(() => ({
      stores: [makeStore({ products: products(4), match_count: 4 }), makeStore({ id: 3, business_name: "Druga", products: products(7).map((p) => ({ ...p, id: p.id + 50 })), match_count: 7 })],
      total: 2,
    }));
    const [four, seven] = await screen.findAllByTestId("search-store");
    expect(within(four!).getAllByTestId("store-product-card")).toHaveLength(4);
    expect(within(four!).queryByTestId("product-slider")).not.toBeInTheDocument();
    expect(within(seven!).getAllByTestId("store-product-card")).toHaveLength(7);
    const slider = within(seven!).getByTestId("product-slider");
    expect(within(slider).getByLabelText(t("storePage.next"))).toBeInTheDocument();
  });

  it("marks a paused or closed store, with grayscale cards and a disabled +", async () => {
    const inAnHour = new Date(Date.now() + 60 * 60 * 1000);
    const time = `${String(inAnHour.getHours()).padStart(2, "0")}:${String(inAnHour.getMinutes()).padStart(2, "0")}`;
    renderPage(() => ({
      stores: [
        makeStore({ orders_paused: true, orders_paused_until: inAnHour.toISOString() }),
        makeStore({ id: 3, business_name: "Voćarna", open_now: false, opens_at: "08:00", opens_on: "tomorrow", products: [makeProduct({ id: 11, name: "Limun" })] }),
        makeStore({ id: 4, business_name: "Otvorena", open_now: true, closes_at: "22:00", products: [makeProduct({ id: 12, name: "Jaja" })] }),
      ],
      total: 3,
    }));
    const [paused, closed, open] = await screen.findAllByTestId("search-store");
    expect(within(paused!).getByTestId("search-store-paused")).toHaveTextContent(`Narudžbe pauzirane do ${time}`);
    expect(within(closed!).getByTestId("search-store-closed")).toHaveTextContent("Zatvoreno · otvara sutra u 08:00");

    const pausedAdd = within(paused!).getByRole("button", { name: t("search.unavailableAdd", { name: "Piletina" }) });
    expect(pausedAdd).toBeDisabled();
    expect(within(closed!).getByRole("button", { name: t("search.unavailableAdd", { name: "Limun" }) })).toBeDisabled();
    expect(within(paused!).getByTestId("store-product-card").parentElement).toHaveClass("grayscale");
    expect(within(paused!).getByRole("link", { name: "Piletina" })).toHaveAttribute("href", "/products/10");

    expect(within(open!).queryByTestId("search-store-closed")).not.toBeInTheDocument();
    expect(within(open!).getByRole("button", { name: t("stepper.add", { name: "Jaja" }) })).toBeEnabled();
    expect(within(open!).getByTestId("store-product-card").parentElement).not.toHaveClass("grayscale");
  });

  it("adds the minimum with +, then steps up to the free quantity and removes below the minimum", async () => {
    renderPage(() => ({ stores: [makeStore({ products: [makeProduct({ id: 10, name: "Piletina", available_quantity: "2" })] })], total: 1 }));
    await screen.findByText("Piletina");
    const line = (quantity: string) => makeCart([makeCartLine({ product_id: 10, name: "Piletina", quantity })]);

    apiMock.put.mockResolvedValueOnce({ data: { cart: line("1") } });
    await userEvent.click(screen.getByRole("button", { name: t("stepper.add", { name: "Piletina" }) }));
    expect(apiMock.put).toHaveBeenLastCalledWith("/cart/items/10", { quantity: 1 });
    const stepper = await screen.findByRole("group", { name: t("stepper.label", { name: "Piletina" }) });

    apiMock.put.mockResolvedValueOnce({ data: { cart: line("2") } });
    await userEvent.click(within(stepper).getByRole("button", { name: t("stepper.increase", { name: "Piletina" }) }));
    expect(apiMock.put).toHaveBeenLastCalledWith("/cart/items/10", { quantity: 2 });
    await waitFor(() => expect(within(stepper).getByRole("button", { name: t("stepper.increase", { name: "Piletina" }) })).toBeDisabled());

    apiMock.put.mockResolvedValueOnce({ data: { cart: line("1") } });
    await userEvent.click(within(stepper).getByRole("button", { name: t("stepper.decrease", { name: "Piletina" }) }));
    apiMock.delete.mockResolvedValueOnce({ data: { cart: makeCart([]) } });
    await userEvent.click(await within(stepper).findByRole("button", { name: t("stepper.remove", { name: "Piletina" }) }));
    expect(apiMock.delete).toHaveBeenCalledWith("/cart/items/10");
    expect(await screen.findByRole("button", { name: t("stepper.add", { name: "Piletina" }) })).toBeInTheDocument();
  });

  it("asks to empty the cart when it holds another store's products", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage(() => ({ stores: [makeStore()], total: 1 }));
    await screen.findByText("Piletina");
    apiMock.put.mockRejectedValueOnce(otherStoreError());
    await userEvent.click(screen.getByRole("button", { name: t("stepper.add", { name: "Piletina" }) }));
    const dialog = await screen.findByRole("dialog", { name: t("cart.otherStore.title") });
    apiMock.put.mockResolvedValueOnce({ data: { cart: makeCart([makeCartLine({ product_id: 10, quantity: "1" })]) } });
    await userEvent.click(within(dialog).getByRole("button", { name: t("cart.otherStore.confirm") }));
    expect(apiMock.put).toHaveBeenLastCalledWith("/cart/items/10", { quantity: 1, replace: true });
  });

  it("shows the cart bar with the cart's store while the cart is not empty", async () => {
    cart = makeCart([makeCartLine({ product_id: 10, name: "Piletina", quantity: "3" })]);
    renderPage(() => ({ stores: [makeStore()], total: 1 }));
    const bar = await screen.findByTestId("store-cart-bar");
    expect(within(bar).getByTestId("store-cart-bar-store")).toHaveTextContent("Korpa · Prodavnica Merkator");
    expect(within(bar).getByRole("link", { name: t("storePage.cartBar.goToCart") })).toHaveAttribute("href", "/cart");
    expect(within(bar).getByRole("button", { name: t("cart.emptyCart") })).toBeInTheDocument();
  });

  it("loads more stores", async () => {
    renderPage((params) => ({
      stores: Array.from({ length: Math.min(params.limit as number, 14) }, (_, i) =>
        makeStore({ id: i + 1, business_name: `Prodavnica ${i + 1}`, products: [] }),
      ),
      total: 14,
    }));
    await screen.findByText("Prodavnica 12");
    await userEvent.click(screen.getByRole("button", { name: t("common.loadMore") }));
    expect(await screen.findByText("Prodavnica 14")).toBeInTheDocument();
    expect(lastParams()).toMatchObject({ limit: 24 });
  });

  it("shows the empty list inside the radius with the widen button", async () => {
    renderPage(() => ({ stores: [], total: 0 }));
    const empty = await screen.findByTestId("search-empty");
    expect(empty).toHaveTextContent(t("radius.emptyOffers", { radius: "10" }));
    await userEvent.click(within(empty).getByRole("button", { name: "Prikaži do 20 km" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ radius: "20" }));
  });

  it("shows no results for the filters with Očisti filtere, and nothing on offer at all", async () => {
    renderPage(() => ({ stores: [], total: 0 }), "/search?q=mlijeko");
    await screen.findByTestId("search-empty");
    // Without the radius, the name alone finds nothing.
    await userEvent.click(screen.getByRole("button", { name: t("listFilters.remove", { filter: t("radius.label") }) }));
    await screen.findByText(t("search.noResultsText"));
    await userEvent.click(within(screen.getByTestId("search-empty")).getByRole("button", { name: t("filters.clear") }));
    expect(await screen.findByText(t("product.noAvailableProductsTitle"))).toBeInTheDocument();
    await waitFor(() => expect(lastParams()).toMatchObject({ name: "", radius: "all" }));
  });

  it("shows the load error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage(new Error("network"));
    expect(await screen.findByTestId("search-error")).toHaveTextContent(t("common.loadErrorTitle"));
  });

  it("fills the name filter from ?q= (the header search) and searches with it", async () => {
    renderPage(() => ({ stores: [makeStore()], total: 1 }), "/search?q=mlijeko");
    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(t("search.searchPlaceholder"))).toHaveValue("mlijeko");
    expect(searchCalls().every(([, config]) => (config?.params as Record<string, unknown>).name === "mlijeko")).toBe(true);
  });
});
