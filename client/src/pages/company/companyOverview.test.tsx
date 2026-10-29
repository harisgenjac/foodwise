import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CompanyOverviewPage from "./CompanyOverviewPage.js";
import { apiMock, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { CompanyDashboard, CompanyDashboardBranch, CreditRequest } from "../../types/index.js";

// The headquarters' overview ("Pregled"): decisions, stat cards and the branch table.

const hq = makeUser({ id: 9, role: "COMPANY", first_name: "Selma", company_id: 3, company_name: "Bingo d.o.o." });

const PLANS = [{ id: 2, name: "Standard", credits_per_period: 50, price: "30.00" }];

const topup: CreditRequest = {
  id: 31,
  user_id: 22,
  request_type: "TOPUP",
  plan_id: null,
  topup_package_id: 4,
  period_month: "2030-01-01",
  auto_renew: false,
  status: "COMPANY_REVIEW",
  source: "BRANCH",
  created_at: "2030-01-10T09:00:00.000Z",
  reviewed_at: null,
  requested_by: 22,
  company_note: null,
  company_reviewed_at: null,
  plan_name: null,
  credits: 20,
  price: "15.00",
  branch_name: "Bingo Tuzla",
};

const branch = (overrides: Partial<CompanyDashboardBranch>): CompanyDashboardBranch => ({
  id: 21,
  name: "Bingo Visoko",
  city: "Visoko",
  status: "active",
  plan_name: "Standard",
  has_subscription: true,
  next_plan_name: null,
  has_next_subscription: false,
  used: 10,
  total: 50,
  available: 40,
  open_requests: [],
  active_products: 4,
  pending_reservations: 1,
  reservations_this_month: 6,
  completed_this_month: 5,
  saved_this_month: { kg: 12.5, l: 0, pieces: 3 },
  value_this_month: 40,
  ...overrides,
});

const DASHBOARD: CompanyDashboard = {
  company: { id: 3, name: "Bingo d.o.o." },
  periodStart: "2030-01-01",
  periodEnd: "2030-01-31",
  nextPeriodStart: "2030-02-01",
  renewalWindow: false,
  decisions: [
    { type: "TOPUP_REVIEW", branch_id: 22, branch_name: "Bingo Tuzla", request: topup },
    { type: "NO_PLAN", branch_id: 23, branch_name: "Bingo Kakanj" },
    { type: "LOW_CREDITS", branch_id: 22, branch_name: "Bingo Tuzla", used: 19, total: 20 },
  ],
  totals: {
    branches: { active: 3, all: 4, deactivated: 1 },
    credits: { used: 29, total: 70 },
    reservations: { total: 9, picked_up: 7, pending: 2 },
    saved: { kg: 12.5, l: 1.5, pieces: 3, value: 52.4 },
  },
  branches: [
    branch({}),
    branch({ id: 22, name: "Bingo Tuzla", city: "Tuzla", plan_name: "Basic", used: 19, total: 20, available: 1 }),
    branch({ id: 23, name: "Bingo Kakanj", city: null, plan_name: null, has_subscription: false, used: 0, total: 0 }),
    branch({ id: 24, name: "Bingo Zatvoreno", status: "deactivated", plan_name: null, has_subscription: false }),
  ],
};

const renderPage = (dashboard: CompanyDashboard = DASHBOARD) =>
  renderWithProviders(<CompanyOverviewPage />, {
    route: "/dashboard",
    path: "/dashboard",
    user: hq,
    get: { "/company/dashboard": dashboard, "/company/credits/plans": { plans: PLANS } },
  });

const decisionsSection = async () =>
  (await screen.findByRole("heading", { name: t("company.overview.decisionsTitle") })).closest("section")!;

// The value of a stat card, found by its label.
const statCard = (label: string) => screen.getByText(label, { selector: "p.truncate" }).parentElement!;
const dashboardCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/company/dashboard");

describe("CompanyOverviewPage", () => {
  it("shows the company with a new-branch action", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Bingo d.o.o." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(t("company.branches.newBranch")) })).toHaveAttribute(
      "href",
      "/company/branches/new",
    );
  });

  it("lists what waits for a decision", async () => {
    renderPage();
    const section = await decisionsSection();
    expect(within(screen.getByTestId("decision-TOPUP_REVIEW-22")).getByText(
      t("company.overview.topupRequested", {
        credits: `+${t("credits.profile.creditsCount", { count: 20 })}`,
        price: t("credits.profile.price", { price: "15.00" }),
      }),
    )).toBeInTheDocument();
    expect(within(screen.getByTestId("decision-NO_PLAN-23")).getByText(t("company.overview.noPlan"))).toBeInTheDocument();
    expect(
      within(screen.getByTestId("decision-LOW_CREDITS-22")).getByText(
        t("company.overview.lowCredits", { used: 19, total: 20 }),
      ),
    ).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Bingo Kakanj" })).toHaveAttribute("href", "/company/branches/23");
    expect(within(screen.getByTestId("decision-LOW_CREDITS-22")).getByRole("button", { name: t("company.credits.addCredits") })).toBeEnabled();
    expect(
      within(screen.getByTestId("decision-LOW_CREDITS-22")).queryByRole("button", { name: t("company.credits.choosePlan") }),
    ).not.toBeInTheDocument();
  });

  it("shows next month in a renewal decision", async () => {
    renderPage({
      ...DASHBOARD,
      renewalWindow: true,
      decisions: [{ type: "RENEWAL", branch_id: 21, branch_name: "Bingo Visoko" }],
    });
    await decisionsSection();
    const months = t("dashboard.months", { returnObjects: true }) as string[];
    expect(screen.getByTestId("decision-RENEWAL-21")).toHaveTextContent(months[1]!);
  });

  it("hides the block when nothing waits", async () => {
    renderPage({ ...DASHBOARD, decisions: [] });
    await screen.findByRole("heading", { name: t("company.overview.branchesTitle") });
    expect(screen.queryByRole("heading", { name: t("company.overview.decisionsTitle") })).not.toBeInTheDocument();
  });

  it("approves and rejects a top-up inline, then reloads", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderPage();
    const row = within(await screen.findByTestId("decision-TOPUP_REVIEW-22"));

    await userEvent.click(row.getByRole("button", { name: t("company.credits.approve") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("company.credits.approve") }));
    expect(apiMock.post).toHaveBeenCalledWith("/company/credits/branch-requests/31/approve", {});
    await waitFor(() => expect(dashboardCalls()).toHaveLength(2));

    await userEvent.click(row.getByRole("button", { name: t("company.credits.reject") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "Ne sada");
    await userEvent.click(within(dialog).getByRole("button", { name: t("company.credits.reject") }));
    expect(apiMock.post).toHaveBeenCalledWith("/company/credits/branch-requests/31/reject", { note: "Ne sada" });
    await waitFor(() => expect(dashboardCalls()).toHaveLength(3));
  });

  it("opens the plan dialog for the branch of a decision", async () => {
    renderPage();
    const row = within(await screen.findByTestId("decision-NO_PLAN-23"));
    await userEvent.click(row.getByRole("button", { name: t("company.credits.choosePlan") }));
    await userEvent.click(await screen.findByRole("button", { name: /Standard/ }));
    expect(apiMock.get).toHaveBeenCalledWith("/company/credits/plans");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      t("credits.modal.titleForBranch", { plan: "Standard", branch: "Bingo Kakanj" }),
    );
  });

  it("shows this month's totals in the stat cards", async () => {
    renderPage();
    await screen.findByRole("heading", { name: t("company.overview.branchesTitle") });

    const branches = statCard(t("company.overview.statBranches"));
    expect(branches).toHaveTextContent("3 / 4");
    expect(branches).toHaveTextContent(t("company.overview.deactivated", { count: 1 }));
    const credits = statCard(t("company.overview.statCredits"));
    expect(credits).toHaveTextContent("29 / 70");
    expect(within(credits).getByRole("progressbar", { name: t("company.overview.creditsUsage") })).toHaveAttribute(
      "aria-valuenow",
      "41",
    );
    const reservations = statCard(t("company.overview.statReservations"));
    expect(reservations).toHaveTextContent("9");
    expect(reservations).toHaveTextContent(t("company.overview.reservationsDetail", { pickedUp: 7, pending: 2 }));
    const saved = statCard(t("company.overview.statSaved"));
    expect(saved).toHaveTextContent("52.40 KM");
    expect(within(saved).getAllByRole("listitem").map((chip) => chip.textContent)).toEqual(["12.5 kg", "1.5 l", "3 kom"]);
  });

  it("lists the branches with status, credit usage and a link", async () => {
    renderPage();
    const tuzla = within(await screen.findByTestId("dashboard-branch-22"));
    expect(tuzla.getByRole("link", { name: "Bingo Tuzla" })).toHaveAttribute("href", "/company/branches/22");
    expect(tuzla.getByText(t("company.branchStatus.active"))).toBeInTheDocument();
    expect(tuzla.getByRole("progressbar", { name: t("company.credits.branchUsage", { branch: "Bingo Tuzla" }) })).toHaveAttribute(
      "aria-valuenow",
      "95",
    );
    const closed = within(screen.getByTestId("dashboard-branch-24"));
    expect(closed.getByText(t("company.branchStatus.deactivated"))).toBeInTheDocument();
    expect(within(screen.getByTestId("dashboard-branch-23")).getByText(t("company.credits.noPlan"))).toBeInTheDocument();
  });

  it("shows an empty state without branches", async () => {
    renderPage({ ...DASHBOARD, decisions: [], branches: [] });
    expect(await screen.findByText(t("company.overview.noBranchesTitle"))).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(t("company.overview.statCredits"))).not.toBeInTheDocument();
  });
});
