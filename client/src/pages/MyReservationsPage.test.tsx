import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import MyReservationsPage from "./MyReservationsPage.js";
import { apiMock, axiosError, makeReservation, makeUser, renderWithProviders, t } from "../test/utils.js";
import type { Reservation } from "../types/index.js";

const SUMMARY = {
  total: 10,
  active: 7,
  counts: { Pending: 4, Confirmed: 3, Completed: 0, Rejected: 3, Cancelled: 0 },
};

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

// The list mock gets the request params, so a test can answer Active and History differently.
const renderPage = (
  reservations: Reservation[] | ((params: Record<string, unknown>) => Reservation[]),
  summary = SUMMARY,
) =>
  renderWithProviders(<MyReservationsPage />, {
    route: "/my-reservations",
    path: "/my-reservations",
    user: makeUser(),
    get: {
      "/reservations/mine": (params: unknown) => {
        const list = typeof reservations === "function" ? reservations(params as Record<string, unknown>) : reservations;
        return { reservations: list, total: list.length };
      },
      "/reservations/mine/summary": { summary },
    },
  });

const listCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/reservations/mine");
const lastListParams = () => listCalls().at(-1)?.[1]?.params;
const lastSummaryParams = () =>
  apiMock.get.mock.calls.filter(([url]) => url === "/reservations/mine/summary").at(-1)?.[1]?.params;

const tab = (key: "active" | "history") => screen.getByRole("tab", { name: new RegExp(t(`reservations.tabs.${key}`)) });
const statusSelect = () => screen.queryByLabelText(t("filters.selectResStatus"));
const periodSelect = () => screen.getByLabelText(t("reservations.period.all"));
const cancelButton = () => screen.getByRole("button", { name: t("reservations.cancelShortButton") });
const summaryButton = (status: string, count: number) =>
  screen.getByRole("button", { name: t(`reservations.summary.${status}`, { count }) });

describe("MyReservationsPage", () => {
  it("opens on Active with the active scope, newest first, 12 at a time", async () => {
    renderPage([makeReservation({ id: 1, product_name: "Piletina", status: "Pending" })]);

    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(tab("active")).toHaveAttribute("aria-selected", "true");
    expect(lastListParams()).toMatchObject({ scope: "active", sort: "newest", limit: 12 });
    expect(lastListParams()).not.toHaveProperty("status");
    expect(screen.getByLabelText(t("filters.sortBy"))).toHaveValue("newest");
    expect(statusSelect()).not.toBeInTheDocument();
  });

  it("shows the tab counts from the summary", async () => {
    renderPage([]);
    await waitFor(() => expect(within(tab("active")).getByText("7")).toBeInTheDocument());
    expect(within(tab("history")).getByText("10")).toBeInTheDocument();
  });

  it("shows the summary line with only the non-zero statuses", async () => {
    renderPage([]);
    expect(await screen.findByText(t("reservations.summary.total", { count: 10 }))).toBeInTheDocument();
    expect(summaryButton("Pending", 4)).toHaveAttribute("aria-pressed", "false");
    expect(summaryButton("Confirmed", 3)).toBeInTheDocument();
    expect(summaryButton("Rejected", 3)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("reservations.summary.Completed", { count: 0 }) })).not.toBeInTheDocument();
  });

  it("shows the reservations and offers cancelling only Pending ones", async () => {
    renderPage([
      makeReservation({ id: 1, product_name: "Piletina", status: "Pending" }),
      makeReservation({ id: 2, product_name: "Mlijeko", status: "Confirmed" }),
    ]);

    expect(await screen.findByText("Piletina")).toBeInTheDocument();
    expect(screen.getByText("Mlijeko")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: t("reservations.cancelShortButton") })).toHaveLength(1);
  });

  it("shows when each active reservation was made", async () => {
    renderPage([makeReservation({ id: 1, created_at: hoursAgo(2) })]);
    expect(await screen.findByText(t("notifications.time.hoursAgo", { count: 2 }))).toBeInTheDocument();
    expect(screen.getByText(t("reservations.createdAt"))).toBeInTheDocument();
  });

  it("sends the chosen sort and keeps it when the filters are cleared", async () => {
    renderPage([makeReservation()]);
    await screen.findByText("Piletina");

    await userEvent.selectOptions(screen.getByLabelText(t("filters.sortBy")), t("reservations.sortPickupSoonest"));
    await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "active", sort: "pickup" }));

    await userEvent.type(screen.getByPlaceholderText(t("filters.searchByName")), "pile");
    await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
    expect(screen.getByLabelText(t("filters.sortBy"))).toHaveValue("pickup");
    expect(screen.getByPlaceholderText(t("filters.searchByName"))).toHaveValue("");
    expect(tab("active")).toHaveAttribute("aria-selected", "true");
  });

  it("shows an empty Active state with links to the history and the offers", async () => {
    renderPage([]);
    expect(await screen.findByText(t("reservations.emptyActiveTitle"))).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: t("dashboard.browseOffers") }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: t("reservations.showHistory") }));
    expect(tab("history")).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "all" }));
  });

  describe("History", () => {
    const history = [
      makeReservation({ id: 31, product_name: "Jogurt", status: "Rejected", created_at: new Date().toISOString() }),
      makeReservation({
        id: 30,
        product_name: "Hljeb",
        status: "Completed",
        quantity: "3",
        discounted_price: "1.50",
        created_at: new Date(Date.now() - 86400 * 1000).toISOString(),
      }),
    ];
    const renderHistory = () =>
      renderPage((params) => (params.scope === "all" ? history : [makeReservation({ id: 1, product_name: "Aktivna" })]));

    it("loads every status newest first, 20 at a time, as rows grouped by day", async () => {
      renderHistory();
      await screen.findByText("Aktivna");
      await userEvent.click(tab("history"));

      expect(await screen.findByText("Jogurt")).toBeInTheDocument();
      expect(lastListParams()).toMatchObject({ scope: "all", sort: "newest", limit: 20 });
      expect(screen.getByRole("heading", { name: t("notifications.groups.today") })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: t("notifications.groups.yesterday") })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Jogurt/ })).toHaveAttribute("href", "/reservation/31");
      expect(screen.getByRole("link", { name: /Hljeb/ })).toHaveAttribute("href", "/reservation/30");
      expect(screen.getByText("4.50 KM")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: t("reservations.cancelShortButton") })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(t("filters.sortBy"))).not.toBeInTheDocument();
    });

    it("offers the status filter only on History and clears it when leaving", async () => {
      renderHistory();
      await screen.findByText("Aktivna");
      expect(statusSelect()).not.toBeInTheDocument();

      await userEvent.click(tab("history"));
      await userEvent.selectOptions(statusSelect()!, t("reservationStatus.Rejected"));
      await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "all", status: "Rejected" }));

      await userEvent.click(tab("active"));
      await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "active" }));
      expect(lastListParams()).not.toHaveProperty("status");

      await userEvent.click(tab("history"));
      expect(statusSelect()).toHaveValue("");
    });

    it("keeps the name, store and period across tabs and sends the period to the summary", async () => {
      renderHistory();
      await screen.findByText("Aktivna");

      await userEvent.type(screen.getByPlaceholderText(t("filters.searchByName")), "jog");
      await userEvent.type(screen.getByPlaceholderText(t("filters.searchByStore")), "centar");
      await userEvent.selectOptions(periodSelect(), t("reservations.period.last7Days"));
      const filters = { name: "jog", business_name: "centar", period: "7d" };
      await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "active", ...filters }));
      await waitFor(() => expect(lastSummaryParams()).toEqual(filters));

      await userEvent.click(tab("history"));
      await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "all", ...filters }));
      expect(screen.getByPlaceholderText(t("filters.searchByName"))).toHaveValue("jog");
      expect(periodSelect()).toHaveValue("7d");
    });

    it("opens History filtered by a summary status and clears it on a second click", async () => {
      renderHistory();
      await screen.findByText("Aktivna");

      await userEvent.click(await screen.findByRole("button", { name: t("reservations.summary.Rejected", { count: 3 }) }));
      expect(tab("history")).toHaveAttribute("aria-selected", "true");
      expect(summaryButton("Rejected", 3)).toHaveAttribute("aria-pressed", "true");
      expect(statusSelect()).toHaveValue("Rejected");
      await waitFor(() => expect(lastListParams()).toMatchObject({ scope: "all", status: "Rejected" }));

      await userEvent.click(summaryButton("Rejected", 3));
      expect(summaryButton("Rejected", 3)).toHaveAttribute("aria-pressed", "false");
      expect(statusSelect()).toHaveValue("");
      expect(tab("history")).toHaveAttribute("aria-selected", "true");
    });

    it("clears the period, name and status but keeps the tab", async () => {
      renderHistory();
      await screen.findByText("Aktivna");
      await userEvent.click(tab("history"));
      await userEvent.selectOptions(statusSelect()!, t("reservationStatus.Completed"));
      await userEvent.selectOptions(periodSelect(), t("reservations.period.today"));

      await userEvent.click(screen.getByRole("button", { name: t("filters.clear") }));
      expect(tab("history")).toHaveAttribute("aria-selected", "true");
      expect(statusSelect()).toHaveValue("");
      expect(periodSelect()).toHaveValue("");
    });
  });

  it("cancels a reservation after confirmation and reloads the list and the summary", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.patch.mockResolvedValue({ data: { message: "Reservation cancelled successfully." } });
    renderPage([makeReservation({ id: 5, status: "Pending" })]);

    await userEvent.click(await screen.findByRole("button", { name: t("reservations.cancelShortButton") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: t("reservations.cancelButton") }));

    expect(apiMock.patch).toHaveBeenCalledWith("/reservations/5/cancel");
    expect(success).toHaveBeenCalledWith("Reservation cancelled successfully.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(listCalls()).toHaveLength(2);
    expect(apiMock.get.mock.calls.filter(([url]) => url === "/reservations/mine/summary")).toHaveLength(2);
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
