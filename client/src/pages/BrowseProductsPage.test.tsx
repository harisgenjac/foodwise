import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BrowseProductsPage from "./BrowseProductsPage.js";
import { apiMock, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { Product } from "../types/index.js";

const renderPage = (products: (params: unknown) => Product[]) =>
  renderWithProviders(<BrowseProductsPage />, {
    route: "/browse-products",
    path: "/browse-products",
    user: makeUser(),
    get: { "/products": (params: unknown) => ({ products: products(params) }) },
  });

const productCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/products");

describe("BrowseProductsPage", () => {
  it("lists products that still have quantity available", async () => {
    renderPage(() => [
      makeProduct({ id: 1, name: "Piletina" }),
      makeProduct({ id: 2, name: "Rasprodano", available_quantity: "0" }),
    ]);

    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(screen.queryByText("Rasprodano")).not.toBeInTheDocument();
    expect(screen.getByText(t("product.offersCount", { count: 1 }))).toBeInTheDocument();
  });

  it("shows an empty state when nothing is offered", async () => {
    renderPage(() => []);
    expect(await screen.findByText(t("product.noAvailableProductsTitle"))).toBeInTheDocument();
  });

  it("sends the filters to the server and can clear them", async () => {
    renderPage((params) =>
      (params as { name?: string }).name ? [] : [makeProduct({ id: 1, name: "Piletina" })],
    );
    await screen.findByText("Piletina");

    await userEvent.type(screen.getByPlaceholderText(t("filters.searchByName")), "mlijeko");
    const categories = t("categories", { returnObjects: true }) as Record<string, string>;
    await userEvent.selectOptions(screen.getByDisplayValue(t("filters.allCategories")), categories.Dairy!);

    await waitFor(() =>
      expect(productCalls().at(-1)?.[1]).toEqual({
        params: { category: "Dairy", maxPrice: "", name: "mlijeko", expiryWithinDays: "" },
      }),
    );
    expect(await screen.findByText(t("myProducts.noResultsTitle"))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
    expect(await screen.findByText("Piletina")).toBeInTheDocument();
  });

  it("opens the reservation modal for a product", async () => {
    renderPage(() => [makeProduct({ id: 1, name: "Piletina" })]);
    await userEvent.click(await screen.findByRole("button", { name: t("myProducts.reserveButton") }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: t("myReservations.reservePopupTitle") })).toBeInTheDocument();
    expect(within(dialog).getByText("Piletina")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("myReservations.cancelButton") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("links to the product details", async () => {
    renderPage(() => [makeProduct({ id: 42 })]);
    const link = await screen.findByRole("link", { name: new RegExp(t("dashboard.detailsButton")) });
    expect(link).toHaveAttribute("href", "/products/42");
  });
});
