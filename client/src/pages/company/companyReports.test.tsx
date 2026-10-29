import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { AxiosError, AxiosHeaders } from "axios";
import CompanyReportsPage from "./CompanyReportsPage.js";
import { apiMock, makeUser, renderWithProviders, t } from "../../test/utils.js";
import { presetPeriod } from "../../utils/reportPeriods.js";

// The headquarters' reports ("Izvještaji") over all branches or one.

const hq = makeUser({ id: 9, role: "COMPANY", company_id: 3, company_name: "Bingo d.o.o." });

const CREDITS = {
  periodStart: "2030-01-01",
  periodEnd: "2030-01-31",
  totals: { total: 0, used: 0, available: 0, branches: 2, withPlan: 0 },
  branches: [
    { id: 21, business_name: "Bingo Visoko", status: "active", open_requests: [] },
    { id: 24, business_name: "Bingo Zatvoreno", status: "deactivated", open_requests: [] },
  ],
};

const renderPage = (report: unknown = new Blob(["csv"], { type: "text/csv" })) =>
  renderWithProviders(<CompanyReportsPage />, {
    route: "/company/reports",
    path: "/company/reports",
    user: hq,
    get: {
      "/company/credits": CREDITS,
      "/company/reports/sales": report,
      "/company/reports/impact": report,
      "/company/reports/branches": report,
    },
  });

const reportCalls = () => apiMock.get.mock.calls.filter(([url]) => url.startsWith("/company/reports/"));

describe("CompanyReportsPage", () => {
  let link: HTMLAnchorElement | undefined;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:report") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      link = this;
    });
  });

  it("lists the three reports and downloads one for all branches", async () => {
    renderPage();
    const { from, to } = presetPeriod("thisMonth");
    expect(await screen.findByText(t("company.reports.items.sales.title"))).toBeInTheDocument();
    expect(screen.getByText(t("company.reports.items.impact.title"))).toBeInTheDocument();
    expect(screen.getByText(t("company.reports.items.branches.title"))).toBeInTheDocument();
    expect(screen.getByLabelText(t("company.reports.branch"))).toHaveValue("");

    await userEvent.click(screen.getAllByRole("button", { name: t("reports.download") })[2]!);
    await waitFor(() => expect(link?.download).toBe(`poslovnice-${from}-${to}.csv`));
    expect(reportCalls()).toEqual([
      ["/company/reports/branches", { params: { from, to, lang: "bs" }, responseType: "blob" }],
    ]);
  });

  it("narrows a report to the chosen branch, deactivated ones marked", async () => {
    renderPage();
    const { from, to } = presetPeriod("thisMonth");
    const select = await screen.findByLabelText(t("company.reports.branch"));
    await screen.findByRole("option", { name: `Bingo Zatvoreno (${t("company.branchStatus.deactivated")})` });
    await userEvent.selectOptions(select, "21");

    await userEvent.click(screen.getAllByRole("button", { name: t("reports.download") })[0]!);
    await waitFor(() => expect(reportCalls()).toHaveLength(1));
    expect(reportCalls()[0]).toEqual([
      "/company/reports/sales",
      { params: { from, to, lang: "bs", branch_id: "21" }, responseType: "blob" },
    ]);
    await waitFor(() => expect(link?.download).toBe(`prodaja-firma-${from}-${to}.csv`));
  });

  it("shows the server's error from the blob", async () => {
    const errorToast = vi.spyOn(toast, "error");
    const error = new AxiosError("Request failed", "404", undefined, undefined, {
      status: 404,
      statusText: "",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: new Blob([JSON.stringify({ error: "Branch not found." })], { type: "application/json" }),
    });
    renderPage(error);

    await userEvent.click((await screen.findAllByRole("button", { name: t("reports.download") }))[1]!);
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Poslovnica nije pronađena."));
  });
});
