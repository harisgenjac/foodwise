import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardProductCard from "./DashboardProductCard.js";
import { makeProduct, renderWithProviders, t } from "../../test/utils.js";

describe("DashboardProductCard", () => {
  it("shows the store name as a link to the store, with the city", () => {
    renderWithProviders(<DashboardProductCard product={makeProduct()} showStore />);

    const storeLink = screen.getByRole("link", { name: "Market Centar" });
    expect(storeLink).toHaveAttribute("href", "/stores/2");
    expect(storeLink).toHaveAttribute("title", "Market Centar");
    expect(screen.getByText("· Sarajevo")).toBeInTheDocument();
    // The product name stays the card's heading.
    expect(screen.getByRole("heading", { name: "Piletina" })).toBeInTheDocument();
  });

  it("opens only the store page when the store name is clicked", async () => {
    const onReserve = vi.fn();
    renderWithProviders(
      <DashboardProductCard
        product={makeProduct()}
        showStore
        actions={<button type="button" onClick={onReserve}>Reserve</button>}
      />,
    );

    await userEvent.click(screen.getByRole("link", { name: "Market Centar" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/stores/2");
    expect(onReserve).not.toHaveBeenCalled();
  });

  it("has no store line without showStore", () => {
    renderWithProviders(<DashboardProductCard product={makeProduct()} />);

    expect(screen.queryByText(/Market Centar/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Market Centar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(t("dashboard.detailsButton")) })).toHaveAttribute(
      "href",
      "/products/10",
    );
  });

  it("adds the distance from the restaurant's city to the store's city", () => {
    renderWithProviders(<DashboardProductCard product={makeProduct({ city: "Kakanj", distance_km: 16 })} showStore />);
    expect(screen.getByText("· Kakanj · 16 km")).toBeInTheDocument();
    cleanup();
    renderWithProviders(<DashboardProductCard product={makeProduct({ city: "Visoko", distance_km: 0 })} showStore />);
    expect(screen.getByText("· Visoko · " + t("radius.inYourCity"))).toBeInTheDocument();
  });
});

describe("DashboardProductCard chain label", () => {
  it("names a branch's company next to the store, and nothing for an independent store", () => {
    renderWithProviders(<DashboardProductCard product={makeProduct({ company_name: "Bingo d.o.o." })} showStore />);
    expect(screen.getByText(t("store.chainLabel", { company: "Bingo d.o.o." }))).toBeInTheDocument();

    cleanup();
    renderWithProviders(<DashboardProductCard product={makeProduct({ company_name: null })} showStore />);
    expect(screen.queryByText(/Bingo/)).not.toBeInTheDocument();
  });
});
