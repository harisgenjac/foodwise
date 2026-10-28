import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BrowseProductsPage from "./BrowseProductsPage.js";
import { apiMock, makeProduct, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { Product } from "../types/index.js";

// The server filters out sold-out products and pages the rest; `total` counts every match.
const renderPage = (products: (params: unknown) => Product[], total?: number) =>
  renderWithProviders(<BrowseProductsPage />, {
    route: "/browse-products",
    path: "/browse-products",
    user: makeUser(),
    get: {
      "/products": (params: unknown) => {
        const list = products(params);
        return { products: list, total: total ?? list.length };
      },
    },
  });

const productCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/products");

describe("BrowseProductsPage", () => {
  it("lists the products and shows the server total", async () => {
    renderPage(() => [makeProduct({ id: 1, name: "Piletina" })], 30);

    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(screen.getByText(t("product.offersCount", { count: 30 }))).toBeInTheDocument();
  });

  it("loads more when the server has more matches than shown", async () => {
    renderPage((params) => {
      const { limit } = params as { limit: number };
      return Array.from({ length: Math.min(limit, 30) }, (_, i) => makeProduct({ id: i + 1, name: `Proizvod ${i + 1}` }));
    }, 30);
    await screen.findByText("Proizvod 12");
    expect(screen.queryByText("Proizvod 13")).not.toBeInTheDocument();
    expect(screen.getByText(t("common.showingOf", { shown: 12, total: 30 }))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("common.loadMore") }));
    expect(await screen.findByText("Proizvod 24")).toBeInTheDocument();
    expect(productCalls().at(-1)?.[1]?.params).toMatchObject({ limit: 24 });

    await userEvent.click(screen.getByRole("button", { name: t("common.loadMore") }));
    expect(await screen.findByText("Proizvod 30")).toBeInTheDocument();
    expect(productCalls().at(-1)?.[1]?.params).toMatchObject({ limit: 36 });
    expect(screen.queryByRole("button", { name: t("common.loadMore") })).not.toBeInTheDocument();
  });

  it("shows a load error instead of an empty list when the request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithProviders(<BrowseProductsPage />, {
      route: "/browse-products",
      path: "/browse-products",
      user: makeUser(),
      get: { "/products": new Error("network") },
    });
    expect(await screen.findByText(t("common.loadErrorTitle"))).toBeInTheDocument();
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
      expect(productCalls().at(-1)?.[1]?.params).toEqual({
        category: "Dairy",
        name: "mlijeko",
        city_id: "",
        expiryWithinDays: "",
        radius: "10",
        sort: "distance",
        limit: 12,
      }),
    );
    expect(await screen.findByText(t("myProducts.noResultsTitle"))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
    expect(await screen.findByText("Piletina")).toBeInTheDocument();
  });

  it("sends the city filter as an id from the list and clears it", async () => {
    renderPage((params) =>
      (params as { city_id?: string }).city_id ? [] : [makeProduct({ id: 1, name: "Piletina" })],
    );
    await screen.findByText("Piletina");

    const citySelect = screen.getByLabelText(t("cities.label"));
    expect(citySelect).toHaveDisplayValue(t("cities.all"));
    await screen.findByRole("option", { name: "Tuzla" });
    await userEvent.selectOptions(citySelect, "Tuzla");
    await waitFor(() => expect(productCalls().at(-1)?.[1]?.params).toMatchObject({ city_id: "2" }));
    expect(await screen.findByText(t("myProducts.noResultsTitle"))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
    expect(citySelect).toHaveDisplayValue(t("cities.all"));
    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(productCalls().at(-1)?.[1]?.params).toMatchObject({ city_id: "" });
  });

  it("has no max price filter", async () => {
    renderPage(() => [makeProduct({ id: 1, name: "Piletina" })]);
    await screen.findByText("Piletina");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(productCalls().at(-1)?.[1]?.params).not.toHaveProperty("maxPrice");
  });

  describe("sort", () => {
    const sortSelect = () => screen.getByLabelText(t("filters.sortBy"));

    it("sorts nearest first by default", async () => {
      renderPage(() => [makeProduct({ id: 1, name: "Piletina" })]);
      await screen.findByText("Piletina");
      expect(sortSelect()).toHaveValue("distance");
      expect(sortSelect()).toHaveDisplayValue(t("filters.sortNearest"));
      expect(productCalls().at(-1)?.[1]?.params).toMatchObject({ sort: "distance" });
    });

    it.each([
      ["filters.sortExpiry", "expiry"],
      ["filters.sortPriceAsc", "price_asc"],
      ["filters.sortPriceDesc", "price_desc"],
      ["filters.sortDiscountDesc", "discount_desc"],
      ["filters.sortDiscountAsc", "discount_asc"],
      ["filters.sortNewest", "newest"],
      ["filters.sortNearest", "distance"],
    ])("sends the sort for %s", async (label, sort) => {
      renderPage(() => [makeProduct({ id: 1, name: "Piletina" })]);
      await screen.findByText("Piletina");
      // Start from another sort, so picking the default is a change as well.
      await userEvent.selectOptions(sortSelect(), sort === "price_asc" ? "newest" : "price_asc");
      await userEvent.selectOptions(sortSelect(), t(label));
      await waitFor(() => expect(productCalls().at(-1)?.[1]?.params).toMatchObject({ sort }));
    });

    it("sends the sort together with the filters", async () => {
      renderPage(() => [makeProduct({ id: 1, name: "Piletina" })]);
      await screen.findByText("Piletina");
      await userEvent.type(screen.getByPlaceholderText(t("filters.searchByName")), "pile");
      await userEvent.selectOptions(sortSelect(), t("filters.sortPriceAsc"));
      await waitFor(() =>
        expect(productCalls().at(-1)?.[1]?.params).toMatchObject({ name: "pile", sort: "price_asc" }),
      );
    });

    it("goes back to the first page when the sort changes", async () => {
      renderPage((params) => {
        const { limit } = params as { limit: number };
        return Array.from({ length: Math.min(limit, 30) }, (_, i) => makeProduct({ id: i + 1, name: `Proizvod ${i + 1}` }));
      }, 30);
      await screen.findByText("Proizvod 12");
      await userEvent.click(screen.getByRole("button", { name: t("common.loadMore") }));
      expect(await screen.findByText("Proizvod 24")).toBeInTheDocument();

      await userEvent.selectOptions(sortSelect(), t("filters.sortDiscountDesc"));
      await waitFor(() =>
        expect(productCalls().at(-1)?.[1]?.params).toMatchObject({ sort: "discount_desc", limit: 12 }),
      );
    });

    it("keeps the sort when the filters are cleared", async () => {
      renderPage(() => [makeProduct({ id: 1, name: "Piletina" })]);
      await screen.findByText("Piletina");
      await userEvent.selectOptions(sortSelect(), t("filters.sortPriceDesc"));
      await userEvent.type(screen.getByPlaceholderText(t("filters.searchByName")), "pile");
      await waitFor(() => expect(productCalls().at(-1)?.[1]?.params).toMatchObject({ name: "pile" }));

      await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
      await waitFor(() =>
        expect(productCalls().at(-1)?.[1]?.params).toMatchObject({ name: "", sort: "price_desc" }),
      );
      expect(sortSelect()).toHaveValue("price_desc");
    });
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

describe("BrowseProductsPage distance", () => {
  // The server's answer per radius: offers within it, and how many lie beyond.
  const NEARBY: Record<string, { products: Product[]; outside: number }> = {
    "5": { products: [], outside: 3 },
    "10": { products: [makeProduct({ id: 1, name: "Hljeb", city: "Visoko", distance_km: 0 })], outside: 2 },
    "20": {
      products: [
        makeProduct({ id: 1, name: "Hljeb", city: "Visoko", distance_km: 0 }),
        makeProduct({ id: 2, name: "Mlijeko", city: "Kakanj", distance_km: 16 }),
      ],
      outside: 1,
    },
    "50": { products: [], outside: 0 },
    all: { products: [], outside: 0 },
  };
  const renderNearby = () =>
    renderWithProviders(<BrowseProductsPage />, {
      route: "/browse-products",
      path: "/browse-products",
      user: makeUser(),
      get: {
        "/products": ({ radius }: { radius: string }) => {
          const { products, outside } = NEARBY[radius]!;
          return { products, total: products.length, outside_radius_count: outside };
        },
      },
    });
  const lastParams = () => productCalls().at(-1)?.[1]?.params;

  it("asks for 10 km by default and shows the distance on each card", async () => {
    renderNearby();
    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(screen.getByLabelText(t("radius.label"))).toHaveDisplayValue("Do 10 km");
    expect(lastParams()).toMatchObject({ radius: "10", sort: "distance" });
    expect(screen.getByText("· Visoko · u vašem gradu")).toBeInTheDocument();
  });

  it("tells how many offers lie further away and widens step by step", async () => {
    renderNearby();
    expect(await screen.findByText("Još 2 ponude su dalje od 10 km.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Prikaži do 20 km" }));
    expect(await screen.findByText("Mlijeko")).toBeInTheDocument();
    expect(screen.getByText("· Kakanj · 16 km")).toBeInTheDocument();
    expect(screen.getByLabelText(t("radius.label"))).toHaveDisplayValue("Do 20 km");
    expect(lastParams()).toMatchObject({ radius: "20" });
    expect(screen.getByText("Još 1 ponuda je dalje od 20 km.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prikaži do 50 km" })).toBeInTheDocument();
  });

  it("explains an empty result with the radius and offers the next step", async () => {
    renderNearby();
    await screen.findByText("Hljeb");
    await userEvent.selectOptions(screen.getByLabelText(t("radius.label")), "Do 5 km");

    expect(await screen.findByText(t("radius.emptyOffers", { radius: "5" }))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Prikaži do 10 km" }));
    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
  });

  it("counts a changed radius as a filter and resets it to 10 km on clear", async () => {
    renderNearby();
    await screen.findByText("Hljeb");
    expect(screen.queryByRole("button", { name: t("filters.clear") })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(t("radius.label")), "Do 20 km");
    await screen.findByText("Mlijeko");
    await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
    expect(screen.getByLabelText(t("radius.label"))).toHaveDisplayValue("Do 10 km");
    await waitFor(() => expect(lastParams()).toMatchObject({ radius: "10" }));
  });

  it("shows no hint and no radius empty state with all cities", async () => {
    renderNearby();
    await screen.findByText("Hljeb");
    await userEvent.selectOptions(screen.getByLabelText(t("radius.label")), "Svi gradovi");
    expect(await screen.findByText(t("myProducts.noResultsTitle"))).toBeInTheDocument();
    expect(screen.queryByText(t("radius.emptyOffers", { radius: "all" }))).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Prikaži/ })).not.toBeInTheDocument();
  });
});
