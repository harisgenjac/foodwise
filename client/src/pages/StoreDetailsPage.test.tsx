import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoreDetailsPage from "./StoreDetailsPage.js";
import { apiMock, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";

const STORE = makeUser({ id: 2, role: "STORE", business_name: "Market Centar" });

// The store's offers come from GET /products?store_id=: `limit` rows out of `total`.
// The restaurant's orders at this store: `myTotal` over all statuses, 2 per status filter.
let myTotal = 0;

const renderPage = (total: number) =>
  renderWithProviders(<StoreDetailsPage />, {
    route: "/stores/2",
    path: "/stores/:id",
    user: makeUser({ id: 1, role: "RESTAURANT" }),
    get: {
      "/users/stores/2": {
        store: STORE,
        stats: { sold_articles: "0", successful_orders: "0" },
        myOrders: { my_orders_count: "0" },
      },
      "/favorites": { favorites: [] },
      "/products": (params: { limit: number }) => ({
        products: Array.from({ length: Math.min(params.limit, total) }, (_, i) =>
          makeProduct({ id: i + 1, store_id: 2, name: `Ponuda ${i + 1}` }),
        ),
        total,
      }),
      "/orders/mine": (params: { status?: string }) => ({
        orders: [],
        total: params.status ? Math.min(2, myTotal) : myTotal,
      }),
    },
  });

// The list's request (it always sends `status`), not the tab count's.
const lastReservationsParams = () =>
  apiMock.get.mock.calls
    .filter(
      ([url, config]) =>
        url === "/orders/mine" && (config?.params as Record<string, unknown> | undefined)?.status !== undefined,
    )
    .at(-1)?.[1]?.params;
const reservationsTab = () => screen.getByRole("button", { name: new RegExp(t("store.reservationsTab")) });

beforeEach(() => {
  myTotal = 0;
});

const lastProductParams = () =>
  apiMock.get.mock.calls.filter(([url]) => url === "/products").at(-1)?.[1]?.params;
const sortSelect = () => screen.getByLabelText(t("filters.sortBy"));

describe("StoreDetailsPage offers sort", () => {
  it("sends the chosen sort with the store id", async () => {
    renderPage(3);
    await screen.findByText("Ponuda 1");
    expect(sortSelect()).toHaveValue("newest");
    expect(lastProductParams()).toMatchObject({ store_id: "2", sort: "newest" });

    await userEvent.selectOptions(sortSelect(), t("filters.sortDiscountDesc"));
    await waitFor(() => expect(lastProductParams()).toMatchObject({ store_id: "2", sort: "discount_desc" }));
  });

  it("goes back to the first page when the sort changes", async () => {
    renderPage(30);
    await screen.findByText("Ponuda 12");
    await userEvent.click(screen.getByRole("button", { name: t("common.loadMore") }));
    await screen.findByText("Ponuda 24");

    await userEvent.selectOptions(sortSelect(), t("filters.sortPriceAsc"));
    await waitFor(() => expect(lastProductParams()).toMatchObject({ sort: "price_asc", limit: 12 }));
  });

  it("shows no sort when the store has no offers", async () => {
    renderPage(0);
    expect(await screen.findByText(t("store.storeNoProducts"))).toBeInTheDocument();
    expect(screen.queryByLabelText(t("filters.sortBy"))).not.toBeInTheDocument();
  });

  it("shows no sort on the orders tab", async () => {
    renderPage(3);
    await screen.findByText("Ponuda 1");
    await userEvent.click(screen.getByRole("button", { name: new RegExp(t("store.reservationsTab")) }));
    expect(screen.queryByLabelText(t("filters.sortBy"))).not.toBeInTheDocument();
  });
});

describe("StoreDetailsPage orders tab count", () => {
  it("shows the total over all statuses on load, while the Products tab is active", async () => {
    myTotal = 5;
    renderPage(1);
    await screen.findByText("Ponuda 1");
    await waitFor(() => expect(reservationsTab()).toHaveTextContent("5"));
    expect(apiMock.get).toHaveBeenCalledWith("/orders/mine", {
      params: { store_id: "2", limit: 1 },
      signal: expect.any(AbortSignal),
    });
  });

  it("keeps the total when a status filter is selected", async () => {
    myTotal = 5;
    renderPage(1);
    await waitFor(() => expect(reservationsTab()).toHaveTextContent("5"));

    await userEvent.click(reservationsTab());
    await userEvent.click(screen.getByRole("button", { name: t("reservationStatus.Pending") }));
    await waitFor(() => expect(lastReservationsParams()).toMatchObject({ status: "Pending" }));
    expect(reservationsTab()).toHaveTextContent("5");
  });

  it("adds a product to the cart from the store's offer", async () => {
    apiMock.put.mockResolvedValue({ data: { cart: { store: null, items: [], totals: { lines: 1, total: "15.00" }, pending_orders: 0, max_pending_orders: 10 } } });
    renderPage(1);
    await userEvent.click(await screen.findByRole("button", { name: t("cart.add") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(t("dashboard.quantity"), { exact: false }), "3");
    await userEvent.click(within(dialog).getByRole("button", { name: t("cart.add") }));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith("/cart/items/1", { quantity: 3 }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("StoreDetailsPage chain label", () => {
  it("shows the chain of a branch in the header", async () => {
    renderWithProviders(<StoreDetailsPage />, {
      route: "/stores/2",
      path: "/stores/:id",
      user: makeUser({ id: 1, role: "RESTAURANT" }),
      get: {
        "/users/stores/2": {
          store: { ...STORE, company_name: "Bingo d.o.o." },
          stats: { sold_articles: "0", successful_orders: "0" },
          myOrders: { my_orders_count: "0" },
        },
        "/favorites": { favorites: [] },
        "/products": { products: [], total: 0 },
        "/orders/mine": { orders: [], total: 0 },
      },
    });
    expect(await screen.findByText(t("store.chainLabel", { company: "Bingo d.o.o." }))).toBeInTheDocument();
  });
});
