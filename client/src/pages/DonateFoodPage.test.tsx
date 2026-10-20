import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import DonateFoodPage from "./DonateFoodPage.js";
import { apiMock, axiosError, makeDonation, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { DonationOffer } from "../types/index.js";

const renderPage = (donations: DonationOffer[] | ((params: unknown) => unknown)) =>
  renderWithProviders(<DonateFoodPage />, {
    route: "/donate-food",
    path: "/donate-food",
    user: makeUser({ role: "STORE" }),
    get: {
      "/donations/mine": typeof donations === "function" ? donations : { donations },
    },
  });

describe("DonateFoodPage", () => {
  it("shows free and paid donations with their details", async () => {
    renderPage([
      makeDonation({ id: 1, name: "Hljeb" }),
      makeDonation({
        id: 2,
        name: "Grah",
        donation_type: "SPONSORED",
        category: "Meals",
        unit: "portion",
        original_price: "8",
        donation_price: "4",
        pickup_from: "19:00:00",
        pickup_until: "21:00:00",
        allergens: ["celery"],
        serving_temperature: "HOT",
      }),
    ]);

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(screen.getByText(t("donations.count", { count: 2 }))).toBeInTheDocument();
    // The type badge and the "donor pays" row.
    expect(screen.getAllByText(t("donations.card.free"))).toHaveLength(2);
    expect(screen.getByText(t("donations.typeBadges.SPONSORED"))).toBeInTheDocument();
    expect(screen.getByText("4 KM")).toBeInTheDocument();
    expect(screen.getByText("19:00 – 21:00")).toBeInTheDocument();
    expect(screen.getByText(t("donations.allergens.celery"))).toBeInTheDocument();
    expect(screen.getByText(t("donations.temperatures.HOT"))).toBeInTheDocument();
    expect(screen.getByText(t("donations.categories.Meals"))).toBeInTheDocument();
  });

  it("offers editing only for active donations", async () => {
    renderPage([
      makeDonation({ id: 1, name: "Aktivna" }),
      makeDonation({ id: 2, name: "Istekla", status: "Expired" }),
    ]);

    const edit = await screen.findAllByRole("link", { name: t("donations.editButton") });
    expect(edit).toHaveLength(1);
    expect(edit[0]).toHaveAttribute("href", "/donate-food/1/edit");
  });

  it("sends the filters to the server", async () => {
    const params: unknown[] = [];
    renderPage((query) => {
      params.push(query);
      return { donations: [] };
    });

    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: t("donations.filters.type") }),
      "SPONSORED",
    );
    await waitFor(() => expect(params.at(-1)).toEqual({ name: "", type: "SPONSORED", status: "" }));
    expect(screen.getByText(t("donations.noResultsTitle"))).toBeInTheDocument();
  });

  it("shows an empty state with a link to a new donation", async () => {
    renderPage([]);
    expect(await screen.findByText(t("donations.emptyTitle"))).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: t("donations.newButton") })) {
      expect(link).toHaveAttribute("href", "/donate-food/new");
    }
  });

  it("deletes a donation after confirmation", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.delete.mockResolvedValue({ data: { message: "Donacija je obrisana." } });
    renderPage([makeDonation({ id: 7, name: "Hljeb" })]);

    await userEvent.click(await screen.findByRole("button", { name: t("donations.delete.button") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: t("donations.delete.confirm") }));

    expect(apiMock.delete).toHaveBeenCalledWith("/donations/7");
    expect(success).toHaveBeenCalledWith(t("donations.delete.success"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the server error when deleting fails", async () => {
    const error = vi.spyOn(toast, "error");
    apiMock.delete.mockRejectedValue(axiosError(403, "Nemate ovlasti za brisanje ove donacije."));
    renderPage([makeDonation({ id: 7 })]);

    await userEvent.click(await screen.findByRole("button", { name: t("donations.delete.button") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("donations.delete.confirm") }));

    expect(error).toHaveBeenCalledWith("Nemate ovlasti za brisanje ove donacije.");
  });
});
