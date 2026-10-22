import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { AxiosError, AxiosHeaders } from "axios";
import ReportsPage from "./ReportsPage.js";
import { apiMock, makeUser, renderWithProviders, t } from "../test/utils.js";
import { presetPeriod } from "../utils/reportPeriods.js";
import { formatDisplayDate } from "../utils/expiry.js";
import type { User } from "../types/index.js";

const renderPage = (role: User["role"], report: unknown = new Blob(["csv"], { type: "text/csv" })) =>
  renderWithProviders(<ReportsPage />, {
    route: "/reports",
    path: "/reports",
    user: makeUser({ role }),
    get: { "/reports/sales": report, "/reports/impact": report },
  });

const reportCalls = () => apiMock.get.mock.calls.filter(([url]) => url.startsWith("/reports/"));

describe("ReportsPage", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:report");
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("lists the reports as table rows, the sales report for a store", async () => {
    renderPage("STORE");
    await screen.findByText(t("reports.items.sales.store.title"));

    const [, sales, impact] = screen.getAllByRole("row");
    expect(within(sales!).getByText(t("reports.items.sales.store.title"))).toBeInTheDocument();
    expect(within(sales!).getByRole("button", { name: t("reports.download") })).toBeInTheDocument();
    expect(within(impact!).getByText(t("reports.items.impact.store.title"))).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: t("reports.table.report") })).toBeInTheDocument();
  });

  it("shows the default period as dd/mm/yyyy", async () => {
    renderPage("STORE");
    const { from, to } = presetPeriod("thisMonth");
    expect(await screen.findByLabelText(t("reports.from"))).toHaveValue(formatDisplayDate(from));
    expect(screen.getByLabelText(t("reports.to"))).toHaveValue(formatDisplayDate(to));
  });

  it("names the purchases report for a restaurant", async () => {
    renderPage("RESTAURANT");
    expect(await screen.findByText(t("reports.items.sales.restaurant.title"))).toBeInTheDocument();
  });

  it("downloads the report for this month by default as a CSV blob", async () => {
    renderPage("STORE");
    const { from, to } = presetPeriod("thisMonth");

    const [salesButton] = await screen.findAllByRole("button", { name: t("reports.download") });
    await userEvent.click(salesButton!);

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(reportCalls()).toEqual([
      ["/reports/sales", { params: { from, to, lang: "bs" }, responseType: "blob" }],
    ]);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("uses the chosen preset's period", async () => {
    renderPage("RESTAURANT");
    const { from, to } = presetPeriod("lastMonth");

    await userEvent.click(await screen.findByRole("button", { name: t("reports.presets.lastMonth") }));
    expect(screen.getByRole("button", { name: t("reports.presets.lastMonth") })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(t("reports.from"))).toHaveValue(formatDisplayDate(from));
    expect(screen.getByLabelText(t("reports.to"))).toHaveValue(formatDisplayDate(to));

    await userEvent.click(screen.getAllByRole("button", { name: t("reports.download") })[1]!);
    await waitFor(() => expect(reportCalls()).toHaveLength(1));
    expect(reportCalls()[0]).toEqual(["/reports/impact", { params: { from, to, lang: "bs" }, responseType: "blob" }]);
  });

  it("switches to a custom period when a date is edited and blocks a reversed period", async () => {
    const errorToast = vi.spyOn(toast, "error");
    renderPage("STORE");

    const fromInput = await screen.findByLabelText(t("reports.from"));
    await userEvent.clear(fromInput);
    await userEvent.type(fromInput, "01/01/2030");
    await userEvent.tab();
    expect(fromInput).toHaveValue("01/01/2030");
    expect(screen.getByRole("button", { name: t("reports.presets.custom") })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getAllByRole("button", { name: t("reports.download") })[0]!);
    expect(errorToast).toHaveBeenCalledWith(t("reports.invalidPeriod"));
    expect(reportCalls()).toHaveLength(0);
  });

  it("shows the server's error, which arrives as a blob", async () => {
    const errorToast = vi.spyOn(toast, "error");
    const error = new AxiosError("Request failed", "400", undefined, undefined, {
      status: 400,
      statusText: "",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: new Blob([JSON.stringify({ error: "Invalid period." })], { type: "application/json" }),
    });
    renderPage("STORE", error);

    await userEvent.click((await screen.findAllByRole("button", { name: t("reports.download") }))[0]!);

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Invalid period."));
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
