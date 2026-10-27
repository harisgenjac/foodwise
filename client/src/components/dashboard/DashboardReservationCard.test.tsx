import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardReservationCard from "./DashboardReservationCard.js";
import { makeReservation, renderWithProviders, t } from "../../test/utils.js";

describe("DashboardReservationCard", () => {
  it("links the store name to the store on the restaurant side", () => {
    renderWithProviders(
      <DashboardReservationCard
        reservation={makeReservation({ store_id: 2 })}
        partyLabel={t("reservations.seller")}
        linkStore
      />,
    );

    const storeLink = screen.getByRole("link", { name: "Market Centar" });
    expect(storeLink).toHaveAttribute("href", "/stores/2");
    expect(storeLink).toHaveAttribute("title", "Market Centar");
    // The rest of the card is unchanged.
    expect(screen.getByText(t("reservations.seller"))).toBeInTheDocument();
    expect(screen.getByText("Sarajevo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(t("dashboard.detailsButton")) })).toHaveAttribute(
      "href",
      "/reservation/20",
    );
  });

  it("opens only the store page when the store name is clicked", async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <DashboardReservationCard
        reservation={makeReservation({ store_id: 2 })}
        partyLabel={t("reservations.seller")}
        linkStore
        actions={<button type="button" onClick={onCancel}>Cancel</button>}
      />,
    );

    await userEvent.click(screen.getByRole("link", { name: "Market Centar" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/stores/2");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("shows the restaurant name as plain text on the store side", () => {
    renderWithProviders(
      <DashboardReservationCard
        reservation={makeReservation({ business_name: "Restoran Lipa" })}
        partyLabel={t("reservations.buyer")}
      />,
    );

    expect(screen.getByText("Restoran Lipa")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Restoran Lipa" })).not.toBeInTheDocument();
  });

  it("keeps the store name as plain text on the store's own page", () => {
    // StoreDetailsPage's My reservations tab: restaurant data with store_id, but no linkStore.
    renderWithProviders(
      <DashboardReservationCard reservation={makeReservation({ store_id: 2 })} partyLabel={t("myProducts.store")} />,
    );

    expect(screen.getByText("Market Centar")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Market Centar" })).not.toBeInTheDocument();
  });
});
