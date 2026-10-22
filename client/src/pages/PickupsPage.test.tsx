import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import PickupsPage from "./PickupsPage.js";
import { apiMock, axiosError, makeReservation, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { Reservation, User } from "../types/index.js";

const COUNTS = { today: 2, overdue: 1, upcoming: 1, completed: 3 };

// Answers each scope with its own list and records the scopes asked for.
const renderPage = (
  lists: Partial<Record<"today" | "upcoming" | "completed", Reservation[]>>,
  role: User["role"] = "STORE",
) => {
  const scopes: string[] = [];
  renderWithProviders(<PickupsPage />, {
    route: "/pickups",
    path: "/pickups",
    user: makeUser({ role }),
    get: {
      "/reservations/pickups": (params: unknown) => {
        const { scope } = params as { scope: "today" | "upcoming" | "completed" };
        scopes.push(scope);
        return { reservations: lists[scope] ?? [] };
      },
      "/reservations/pickups/counts": { counts: COUNTS },
    },
  });
  return scopes;
};

const overdue = makeReservation({
  id: 1,
  status: "Confirmed",
  product_name: "Piletina",
  business_name: "Bistro Ukus",
  is_overdue: true,
  days_overdue: 2,
});
const onTime = makeReservation({ id: 2, status: "Confirmed", product_name: "Mlijeko", is_overdue: false, days_overdue: 0 });

describe("PickupsPage", () => {
  it("opens on today's pickups with the overdue ones in their own section", async () => {
    const scopes = renderPage({ today: [overdue, onTime] });

    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(scopes[0]).toBe("today");
    expect(screen.getByRole("tab", { name: new RegExp(t("pickups.tabs.today")) })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: new RegExp(t("pickups.sections.overdue")) })).toBeInTheDocument();
    expect(screen.getByText(t("pickups.overdueDays", { count: 2 }))).toBeInTheDocument();
    expect(screen.getByText("Mlijeko")).toBeInTheDocument();
  });

  it("loads another scope when a tab is chosen", async () => {
    const scopes = renderPage({ upcoming: [makeReservation({ status: "Confirmed", product_name: "Hljeb" })] });

    await screen.findByText(t("pickups.empty.todayTitle"));
    await userEvent.click(screen.getByRole("tab", { name: new RegExp(t("pickups.tabs.upcoming")) }));

    expect(await screen.findByText("Hljeb")).toBeInTheDocument();
    expect(scopes).toContain("upcoming");
  });

  it("shows the tab counts from the server", async () => {
    renderPage({});
    const completedTab = await screen.findByRole("tab", { name: new RegExp(t("pickups.tabs.completed")) });
    await waitFor(() => expect(completedTab).toHaveTextContent("3"));
  });

  it("lets the store confirm a pickup and reloads the list and the counts", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.patch.mockResolvedValue({ data: { message: "Reservation marked as picked up." } });
    renderPage({ today: [onTime] });

    await userEvent.click(await screen.findByRole("button", { name: t("pickups.completeButton") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: t("pickups.confirmCompleteButton") }));

    expect(apiMock.patch).toHaveBeenCalledWith("/reservations/2/complete");
    expect(success).toHaveBeenCalledWith("Reservation marked as picked up.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock.get.mock.calls.filter(([url]) => url === "/reservations/pickups/counts")).toHaveLength(2);
  });

  it("offers cancelling only overdue pickups", async () => {
    apiMock.patch.mockResolvedValue({ data: { message: "Overdue reservation cancelled." } });
    renderPage({ today: [overdue, onTime] });

    const cancelButtons = await screen.findAllByRole("button", { name: t("pickups.cancelOverdueButton") });
    expect(cancelButtons).toHaveLength(1);
    await userEvent.click(cancelButtons[0]!);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("pickups.confirmCancelButton") }));

    expect(apiMock.patch).toHaveBeenCalledWith("/reservations/1/cancel-overdue");
  });

  it("keeps the dialog open and shows the server error when the action fails", async () => {
    const error = vi.spyOn(toast, "error");
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.patch.mockRejectedValue(axiosError(400, "Only overdue pickups can be cancelled."));
    renderPage({ today: [overdue] });

    await userEvent.click(await screen.findByRole("button", { name: t("pickups.cancelOverdueButton") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("pickups.confirmCancelButton") }));

    expect(error).toHaveBeenCalledWith("Only overdue pickups can be cancelled.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("gives the restaurant no store actions", async () => {
    renderPage({ today: [overdue, onTime] }, "RESTAURANT");

    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("pickups.completeButton") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("pickups.cancelOverdueButton") })).not.toBeInTheDocument();
    expect(screen.getByText(t("pickups.readyForPickup"))).toBeInTheDocument();
  });

  it("shows when a completed reservation was picked up", async () => {
    renderPage({
      completed: [makeReservation({ status: "Completed", product_name: "Sir", picked_up_at: new Date().toISOString() })],
    });

    await userEvent.click(await screen.findByRole("tab", { name: new RegExp(t("pickups.tabs.completed")) }));
    expect(await screen.findByText("Sir")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: new RegExp(t("pickups.sections.today")) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("pickups.completeButton") })).not.toBeInTheDocument();
  });
});
