import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoreDetailsPage from "./StoreDetailsPage.js";
import { apiMock, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";

const STORE = makeUser({ id: 2, role: "STORE", business_name: "Market Centar" });

// The store's offers come from GET /products?store_id=: `limit` rows out of `total`.
const renderPage = (total: number) =>
  renderWithProviders(<StoreDetailsPage />, {
    route: "/stores/2",
    path: "/stores/:id",
    user: makeUser({ id: 1, role: "RESTAURANT" }),
    get: {
      "/users/stores/2": {
        store: STORE,
        stats: { sold_articles: "0", successful_reservations: "0" },
        myReservations: { my_reservations_count: "0" },
      },
      "/favorites": { favorites: [] },
      "/products": (params: { limit: number }) => ({
        products: Array.from({ length: Math.min(params.limit, total) }, (_, i) =>
          makeProduct({ id: i + 1, store_id: 2, name: `Ponuda ${i + 1}` }),
        ),
        total,
      }),
      "/reservations/mine": { reservations: [], total: 0 },
    },
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

  it("shows no sort on the reservations tab", async () => {
    renderPage(3);
    await screen.findByText("Ponuda 1");
    await userEvent.click(screen.getByRole("button", { name: new RegExp(t("store.reservationsTab")) }));
    expect(screen.queryByLabelText(t("filters.sortBy"))).not.toBeInTheDocument();
  });
});
