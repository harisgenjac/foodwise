import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import ReservationsPage from "./ReservationsPage.js";
import ReservationDetailsPage from "./ReservationDetailsPage.js";
import { apiMock, makeReservation, makeUser, renderWithProviders, t } from "../test/utils.js";
import { formatDateTime } from "../utils/admin.js";
import type { Reservation } from "../types/index.js";

// On the store's list business_name is the restaurant; on the details page it is restaurant_name.
const PENDING = makeReservation({
  id: 7,
  status: "Pending",
  product_name: "Piletina",
  quantity: "3",
  unit: "kg",
  business_name: "Restoran Lipa",
  restaurant_name: "Restoran Lipa",
  pickup_date: "2030-03-15T14:30:00.000Z",
});

const renderList = (reservations: Reservation[] = [PENDING]) =>
  renderWithProviders(<ReservationsPage />, {
    route: "/reservations",
    path: "/reservations",
    user: makeUser({ role: "STORE" }),
    get: { "/reservations/store": { reservations, total: reservations.length } },
  });

const renderDetails = (reservation: Reservation = PENDING) =>
  renderWithProviders(<ReservationDetailsPage />, {
    route: `/reservation/${reservation.id}`,
    path: "/reservation/:id",
    user: makeUser({ role: "STORE" }),
    get: { [`/reservations/${reservation.id}`]: { reservation } },
  });

const acceptDialog = () => screen.findByRole("dialog", { name: t("reservations.acceptConfirmation") });

const expectSummary = (dialog: HTMLElement) => {
  expect(dialog).toHaveTextContent("Piletina");
  expect(dialog).toHaveTextContent(`3 ${t("units.kg")}`);
  expect(dialog).toHaveTextContent("Restoran Lipa");
  expect(dialog).toHaveTextContent(formatDateTime(PENDING.pickup_date));
  expect(dialog).toHaveTextContent(t("reservations.acceptConfirmationText", { business: "Restoran Lipa" }));
};

describe.each([
  ["ReservationsPage", renderList],
  ["ReservationDetailsPage", renderDetails],
])("accepting a reservation on %s", (_name, renderPage) => {
  const openAccept = async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: t("reservations.acceptButton") }));
    return acceptDialog();
  };

  it("asks first and names the product, quantity, restaurant and pickup time", async () => {
    const dialog = await openAccept();
    expectSummary(dialog);
    expect(apiMock.patch).not.toHaveBeenCalled();
  });

  it("sends nothing after cancelling", async () => {
    const dialog = await openAccept();
    await userEvent.click(within(dialog).getByRole("button", { name: t("common.cancel") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock.patch).not.toHaveBeenCalled();
  });

  it("accepts once confirmed and reloads", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.patch.mockResolvedValue({ data: { message: "Reservation accepted successfully." } });
    const dialog = await openAccept();
    const getsBefore = apiMock.get.mock.calls.length;

    await userEvent.click(within(dialog).getByRole("button", { name: t("reservations.acceptButton") }));

    expect(apiMock.patch).toHaveBeenCalledTimes(1);
    expect(apiMock.patch).toHaveBeenCalledWith("/reservations/7/accept");
    expect(success).toHaveBeenCalledWith("Reservation accepted successfully.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(apiMock.get.mock.calls.length).toBeGreaterThan(getsBefore));
  });
});

describe("rejecting a reservation", () => {
  it("confirms in a danger dialog that starts on Go back", async () => {
    apiMock.patch.mockResolvedValue({ data: { message: "Reservation rejected successfully." } });
    renderList();
    await userEvent.click(await screen.findByRole("button", { name: t("reservations.rejectButton") }));

    const dialog = screen.getByRole("dialog", { name: t("reservations.rejectConfirmation") });
    expect(within(dialog).getByRole("button", { name: t("reservations.keepButton") })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: t("reservations.rejectButton") }));

    expect(apiMock.patch).toHaveBeenCalledWith("/reservations/7/reject");
  });
});
