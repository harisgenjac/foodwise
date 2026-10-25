import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyProductsPage from "./MyProductsPage.js";
import { apiMock, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";

const TOTAL = 30;

// The server pages the store's products: `limit` rows out of TOTAL, or none for a name search.
const renderPage = () =>
  renderWithProviders(<MyProductsPage />, {
    route: "/my-products",
    path: "/my-products",
    user: makeUser({ role: "STORE" }),
    get: {
      "/products/mine": (params: { limit: number; name: string }) => {
        const total = params.name ? 14 : TOTAL;
        const count = Math.min(params.limit, total);
        return {
          products: Array.from({ length: count }, (_, i) => makeProduct({ id: i + 1, name: `Proizvod ${i + 1}` })),
          total,
        };
      },
    },
  });

const lastParams = () => apiMock.get.mock.calls.filter(([url]) => url === "/products/mine").at(-1)?.[1]?.params;
const loadMoreButton = () => screen.getByRole("button", { name: t("common.loadMore") });

describe("MyProductsPage", () => {
  it("shows 12 products with the server total and loads 12 more", async () => {
    renderPage();
    await screen.findByText("Proizvod 12");
    expect(screen.queryByText("Proizvod 13")).not.toBeInTheDocument();
    expect(screen.getByText(t("myProducts.productsCount", { count: TOTAL }))).toBeInTheDocument();
    expect(lastParams()).toMatchObject({ limit: 12 });

    await userEvent.click(loadMoreButton());
    expect(await screen.findByText("Proizvod 24")).toBeInTheDocument();
    expect(lastParams()).toMatchObject({ limit: 24 });
    expect(screen.getByText(t("common.showingOf", { shown: 24, total: TOTAL }))).toBeInTheDocument();
  });

  it("goes back to the first page when a filter changes", async () => {
    renderPage();
    await screen.findByText("Proizvod 12");
    await userEvent.click(loadMoreButton());
    await screen.findByText("Proizvod 24");

    await userEvent.type(screen.getByPlaceholderText(t("filters.searchByName")), "Pro");
    await waitFor(() => expect(lastParams()).toMatchObject({ name: "Pro", limit: 12 }));
    await waitFor(() => expect(screen.queryByText("Proizvod 13")).not.toBeInTheDocument());
  });

  it("keeps the loaded pages after deleting a product", async () => {
    apiMock.delete.mockResolvedValue({ data: { message: "Product deleted successfully." } });
    renderPage();
    await screen.findByText("Proizvod 12");
    await userEvent.click(loadMoreButton());
    await screen.findByText("Proizvod 24");

    await userEvent.click(screen.getAllByRole("button", { name: t("myProducts.deleteButton") })[0]!);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: t("myProducts.confirmDeleteButton") }));

    expect(apiMock.delete).toHaveBeenCalledWith("/products/1");
    await waitFor(() =>
      expect(apiMock.get.mock.calls.filter(([url]) => url === "/products/mine")).toHaveLength(3),
    );
    expect(lastParams()).toMatchObject({ limit: 24 });
    expect(screen.getByText("Proizvod 24")).toBeInTheDocument();
  });
});
