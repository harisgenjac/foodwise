import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import MyReservationsPage from "./MyReservationsPage.js";
import { apiMock, axiosError, makeReservation, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { Reservation } from "../types/index.js";

const renderPage = (reservations: Reservation[]) =>
  renderWithProviders(<MyReservationsPage />, {
    route: "/my-reservations",
    path: "/my-reservations",
    user: makeUser(),
    get: { "/reservations/mine": { reservations } },
  });

const cancelButton = () => screen.getByRole("button", { name: t("reservations.cancelShortButton") });

describe("MyReservationsPage", () => {
  it("shows the reservations and offers cancelling only Pending ones", async () => {
    renderPage([
      makeReservation({ id: 1, product_name: "Piletina", status: "Pending" }),
      makeReservation({ id: 2, product_name: "Mlijeko", status: "Confirmed" }),
    ]);

    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(screen.getByText("Mlijeko")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: t("reservations.cancelShortButton") })).toHaveLength(1);
  });

  it("shows an empty state with a link to the offers", async () => {
    renderPage([]);
    expect(await screen.findByText(t("reservations.noCreatedResTitle"))).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: t("dashboard.browseOffers") }).length).toBeGreaterThan(0);
  });

  it("cancels a reservation after confirmation and reloads the list", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.patch.mockResolvedValue({ data: { message: "Reservation cancelled successfully." } });
    renderPage([makeReservation({ id: 5, status: "Pending" })]);

    await userEvent.click(await screen.findByRole("button", { name: t("reservations.cancelShortButton") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: t("reservations.cancelButton") }));

    expect(apiMock.patch).toHaveBeenCalledWith("/reservations/5/cancel");
    expect(success).toHaveBeenCalledWith("Reservation cancelled successfully.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock.get.mock.calls.filter(([url]) => url === "/reservations/mine")).toHaveLength(2);
  });

  it("keeps the reservation when the user changes their mind", async () => {
    renderPage([makeReservation({ id: 5, status: "Pending" })]);

    await userEvent.click(await screen.findByRole("button", { name: t("reservations.cancelShortButton") }));
    await userEvent.click(screen.getByRole("button", { name: t("reservations.keepButton") }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock.patch).not.toHaveBeenCalled();
    expect(cancelButton()).toBeInTheDocument();
  });

  it("shows the server error when cancelling fails", async () => {
    const error = vi.spyOn(toast, "error");
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.patch.mockRejectedValue(axiosError(400, "Reservation is not in 'Pending' status."));
    renderPage([makeReservation({ id: 5, status: "Pending" })]);

    await userEvent.click(await screen.findByRole("button", { name: t("reservations.cancelShortButton") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("reservations.cancelButton") }));

    expect(error).toHaveBeenCalledWith("Reservation is not in 'Pending' status.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
