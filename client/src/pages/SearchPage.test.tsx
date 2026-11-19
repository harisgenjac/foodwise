import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchPage from "./SearchPage.js";
import { CartProvider } from "../context/CartContext.js";
import { apiMock, makeCart, makeCartLine, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { Cart, SearchStore } from "../types/index.js";

const makeStore = (overrides: Partial<SearchStore> = {}): SearchStore => ({
  id: 2,
  business_name: "Market Centar",
  logo_url: null,
  company_name: null,
  city: "Breza",
  distance_km: 7,
  match_count: 1,
  orders_paused: false,
  orders_paused_until: null,
  products: [makeProduct({ id: 10, store_id: 2, name: "Piletina" })],
  ...overrides,
});

type Answer = { stores: SearchStore[]; total: number; outside_radius_count?: number };
let cart: Cart;

// An Error makes the request fail.
const renderPage = (answer: ((params: Record<string, unknown>) => Answer) | Error, route = "/search") =>
  renderWithProviders(
    <CartProvider enabled>
      <SearchPage />
    </CartProvider>,
    {
      route,
      path: "/search",
      user: makeUser({ role: "RESTAURANT" }),
      get: {
        "/products/by-store": answer instanceof Error ? answer : (params: unknown) => answer(params as Record<string, unknown>),
        "/cart": () => ({ cart }),
      },
    },
  );

const searchCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/products/by-store");
const lastParams = () => searchCalls().at(-1)?.[1]?.params as Record<string, unknown>;

beforeEach(() => {
  cart = makeCart([]);
});

describe("SearchPage", () => {
  it("groups the results by store with the logo, city, distance and a link to the store page", async () => {
    renderPage(() => ({
      stores: [
        makeStore({ logo_url: "/uploads/logos/2.png", match_count: 5 }),
        makeStore({ id: 3, business_name: "Pekara Zlatno", city: "Visoko", distance_km: 0, company_name: "Lanac", products: [makeProduct({ id: 11, store_id: 3, name: "Hljeb" })] }),
      ],
      total: 2,
    }));
    const groups = await screen.findAllByTestId("search-store");
    expect(groups).toHaveLength(2);
    const first = within(groups[0]!);
    expect(first.getByRole("heading", { name: "Market Centar" })).toBeInTheDocument();
    expect(first.getByRole("link", { name: "Market Centar" })).toHaveAttribute("href", "/stores/2");
    expect(first.getByText("Breza · 7 km")).toBeInTheDocument();
    expect(first.getByTestId("store-logo")).toBeInTheDocument();
    expect(first.getByRole("link", { name: t("search.seeAll", { count: 5 }) })).toHaveAttribute("href", "/stores/2");
    expect(first.getByText("Piletina")).toBeInTheDocument();
    const second = within(groups[1]!);
    expect(second.getByTestId("store-generic-image")).toBeInTheDocument();
    expect(second.getByText(t("store.chainLabel", { company: "Lanac" }))).toBeInTheDocument();
    expect(screen.getByText(t("search.storeCount", { count: 2 }))).toBeInTheDocument();
  });

  it("sends the filters and sort, with today, tomorrow and 3 days for expiry", async () => {
    renderPage(() => ({ stores: [makeStore()], total: 1 }));
    await screen.findByText("Piletina");
    expect(lastParams()).toMatchObject({ sort: "newest", radius: "10", name: "", limit: 12 });

    const expiry = screen.getByLabelText(t("filters.expiryDate"));
    expect(within(expiry).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["", "0", "1", "3"]);
    await userEvent.selectOptions(expiry, "1");
    await userEvent.selectOptions(screen.getByLabelText(t("product.category")), "Dairy");
    await userEvent.type(screen.getByPlaceholderText(t("filters.searchByName")), "mlij");
    await userEvent.selectOptions(screen.getByLabelText(t("filters.sortBy")), "expiry");
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ expiryWithinDays: "1", category: "Dairy", name: "mlij", sort: "expiry" }),
    );
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

  it("shows the radius empty state and the hint about further offers", async () => {
    const { unmount } = renderPage(() => ({ stores: [], total: 0 }));
    expect(await screen.findByText(t("radius.emptyOffers", { radius: "10" }))).toBeInTheDocument();
    unmount();

    renderPage(() => ({ stores: [makeStore()], total: 1, outside_radius_count: 3 }));
    expect(await screen.findByText(t("radius.moreOffers", { count: 3, radius: "10" }))).toBeInTheDocument();
  });

  it("shows no results for active filters without the radius, and a load error", async () => {
    const { unmount } = renderPage(() => ({ stores: [], total: 0 }));
    await screen.findByText(t("radius.emptyOffers", { radius: "10" }));
    // The city list loads on its own; wait for it, so the choice is there.
    const city = screen.getByLabelText(t("cities.label"));
    await within(city).findByRole("option", { name: "Tuzla" });
    await userEvent.selectOptions(city, "2");
    expect(await screen.findByText(t("myProducts.noResultsTitle"))).toBeInTheDocument();
    unmount();

    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage(new Error("network"));
    expect(await screen.findByText(t("common.loadErrorTitle"))).toBeInTheDocument();
  });

  it("adds a product with + and shows the stepper", async () => {
    renderPage(() => ({ stores: [makeStore()], total: 1 }));
    await screen.findByText("Piletina");
    cart = makeCart([makeCartLine({ product_id: 10, name: "Piletina", quantity: "1" })]);
    apiMock.put.mockResolvedValueOnce({ data: { cart } });
    await userEvent.click(screen.getByRole("button", { name: t("stepper.add", { name: "Piletina" }) }));
    expect(apiMock.put).toHaveBeenCalledWith("/cart/items/10", { quantity: 1 });
    expect(await screen.findByRole("group", { name: t("stepper.label", { name: "Piletina" }) })).toBeInTheDocument();
  });

  it("fills the name filter from ?q= (the header search) and searches with it", async () => {
    renderPage(() => ({ stores: [makeStore()], total: 1 }), "/search?q=mlijeko");
    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(t("filters.searchByName"))).toHaveValue("mlijeko");
    expect(searchCalls().length).toBeGreaterThan(0);
    expect(searchCalls().every(([, config]) => (config?.params as Record<string, unknown>).name === "mlijeko")).toBe(true);
  });
});
