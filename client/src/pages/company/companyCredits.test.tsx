import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CompanyCreditsPage from "./CompanyCreditsPage.js";
import CompanyBranchDetailsPage from "./CompanyBranchDetailsPage.js";
import { apiMock, makeCreditSummary, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { BranchDetails, CompanyBranchCredits, CompanyCredits, CreditRequest } from "../../types/index.js";

// The headquarters' "Krediti i pretplate" page and the branch page's credits card.

const hq = makeUser({ id: 9, role: "COMPANY", company_id: 3, company_name: "Bingo d.o.o.", phone: "035 000" });
const PLANS = [
  { id: 1, name: "Basic", credits_per_period: 20, price: "15.00" },
  { id: 2, name: "Standard", credits_per_period: 50, price: "30.00" },
];
const PACKAGES = [{ id: 4, credits: 20, price: "15.00" }];

const request = (overrides: Partial<CreditRequest> = {}): CreditRequest => ({
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
  ...overrides,
});

const branchRow = (overrides: Partial<CompanyBranchCredits>): CompanyBranchCredits => ({
  id: 21,
  business_name: "Bingo Visoko",
  status: "active",
  plan_name: "Standard",
  has_subscription: true,
  auto_renew: true,
  total: 50,
  used: 10,
  available: 40,
  next_plan_name: null,
  next_auto_renew: null,
  open_requests: [],
  ...overrides,
});

const OVERVIEW: CompanyCredits = {
  periodStart: "2030-01-01",
  periodEnd: "2030-01-31",
  totals: { total: 70, used: 29, available: 41, branches: 3, withPlan: 2 },
  branches: [
    branchRow({}),
    branchRow({ id: 22, business_name: "Bingo Tuzla", plan_name: "Basic", auto_renew: false, total: 20, used: 19, available: 1 }),
    branchRow({
      id: 23,
      business_name: "Bingo Kakanj",
      plan_name: null,
      has_subscription: false,
      auto_renew: null,
      total: 0,
      used: 0,
      available: 0,
    }),
  ],
};

const renderPage = (extra: Record<string, unknown> = {}) =>
  renderWithProviders(<CompanyCreditsPage />, {
    route: "/company/credits",
    path: "/company/credits",
    user: hq,
    get: {
      "/company/credits": OVERVIEW,
      "/company/credits/branch-requests": { requests: [request()] },
      "/company/credits/requests": {
        requests: [request({ id: 30, status: "COMPANY_REJECTED", company_note: "Ne sada." })],
        total: 1,
      },
      "/company/credits/plans": { plans: PLANS },
      "/company/credits/topup-packages": { packages: PACKAGES },
      ...extra,
    },
  });

const row = (id: number) => screen.getByTestId(`branch-credits-${id}`);

describe("CompanyCreditsPage", () => {
  it("shows the company totals and each branch's plan and usage in the Credits page colours", async () => {
    renderPage();
    expect(await screen.findByText(t("company.credits.withPlanValue", { withPlan: 2, total: 3 }))).toBeInTheDocument();
    expect(screen.getByText("70")).toBeInTheDocument();

    const visoko = within(row(21)).getByRole("progressbar");
    expect(visoko).toHaveAttribute("aria-valuenow", "20");
    expect(visoko.firstElementChild).toHaveClass("bg-green-500");
    const tuzla = within(row(22)).getByRole("progressbar");
    expect(tuzla).toHaveAttribute("aria-valuenow", "95");
    expect(tuzla.firstElementChild).toHaveClass("bg-red-500");
    expect(within(row(23)).getAllByText(t("company.credits.noPlan")).length).toBeGreaterThan(0);
    expect(within(row(21)).getByRole("link", { name: "Bingo Visoko" })).toHaveAttribute("href", "/company/branches/21");
  });

  it("chooses a plan for a branch with the store's explanation, the branch named in the title", async () => {
    apiMock.post.mockResolvedValue({ data: { message: "Request sent." } });
    renderPage();
    await screen.findByTestId("branch-credits-23");
    await userEvent.click(within(row(23)).getByRole("button", { name: t("company.credits.choosePlan") }));
    await userEvent.click(await screen.findByRole("button", { name: /Standard/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(t("credits.modal.titleForBranch", { plan: "Standard", branch: "Bingo Kakanj" }));
    expect(dialog).toHaveTextContent(t("credits.modal.chargeStore"));
    await userEvent.click(within(dialog).getByRole("radio", { name: t("credits.modal.autoRenew") }));
    await userEvent.click(within(dialog).getByRole("button", { name: t("credits.modal.submit") }));
    expect(apiMock.post).toHaveBeenCalledWith("/company/branches/23/credits/requests", {
      request_type: "SUBSCRIPTION",
      plan_id: 2,
      period: "current",
      auto_renew: true,
    });
  });

  it("adds credits for a branch with a plan, and not for one without", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByTestId("branch-credits-21");
    expect(within(row(23)).getByRole("button", { name: t("company.credits.addCredits") })).toBeDisabled();
    await userEvent.click(within(row(21)).getByRole("button", { name: t("company.credits.addCredits") }));
    await userEvent.click(await screen.findByRole("button", { name: /\+20/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      t("credits.topupModal.titleForBranch", {
        credits: t("credits.profile.creditsCount", { count: 20 }),
        branch: "Bingo Visoko",
      }),
    );
    expect(dialog).toHaveTextContent(t("credits.topupModal.what"));
    await userEvent.click(within(dialog).getByRole("button", { name: t("credits.modal.submit") }));
    expect(apiMock.post).toHaveBeenCalledWith("/company/branches/21/credits/requests", {
      request_type: "TOPUP",
      topup_package_id: 4,
    });
  });

  it("turns a branch's auto-renew off", async () => {
    apiMock.patch.mockResolvedValue({ data: { message: "Auto-renew turned off." } });
    renderPage();
    const toggle = await screen.findByRole("switch", { name: t("company.credits.autoRenewFor", { branch: "Bingo Visoko" }) });
    expect(toggle).toBeChecked();
    expect(screen.getByRole("switch", { name: t("company.credits.autoRenewFor", { branch: "Bingo Kakanj" }) })).toBeDisabled();
    await userEvent.click(toggle);
    expect(apiMock.patch).toHaveBeenCalledWith("/company/branches/21/credits/auto-renew", { auto_renew: false });
  });

  it("approves and rejects the branches' top-up requests", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderPage();
    const section = (await screen.findByRole("heading", { name: t("company.credits.branchRequestsTitle") })).closest("section")!;
    expect(within(section).getByText("Bingo Tuzla")).toBeInTheDocument();

    await userEvent.click(within(section).getByRole("button", { name: t("company.credits.approve") }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("company.credits.approve") }));
    expect(apiMock.post).toHaveBeenCalledWith("/company/credits/branch-requests/31/approve", {});

    await userEvent.click(within(section).getByRole("button", { name: t("company.credits.reject") }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "Ne ovaj mjesec");
    await userEvent.click(within(dialog).getByRole("button", { name: t("company.credits.reject") }));
    expect(apiMock.post).toHaveBeenCalledWith("/company/credits/branch-requests/31/reject", { note: "Ne ovaj mjesec" });
  });

  it("shows the request history across branches with the headquarters' note", async () => {
    renderPage();
    const section = (await screen.findByRole("heading", { name: t("company.credits.historyTitle") })).closest("section")!;
    await waitFor(() => expect(within(section).getByText(t("credits.requestStatuses.COMPANY_REJECTED"))).toBeInTheDocument());
    expect(within(section).getByText(t("credits.profile.companyNote", { note: "Ne sada." }))).toBeInTheDocument();
  });
});

describe("the branch page's credits card", () => {
  const details: BranchDetails = {
    branch: {
      id: 21,
      email: "bingo.visoko@test.com",
      first_name: "Mirza",
      last_name: "Hadžić",
      business_name: "Bingo Visoko",
      city_id: 1,
      city: "Visoko",
      address: "Alije Izetbegovića 22",
      phone: "032 400",
      opening_hours: null,
      pickup_hours: null,
      logo_url: null,
      description: null,
      status: "active",
      deactivated_at: null,
      deactivated_by_email: null,
      must_change_password: false,
      created_at: "2026-10-01T10:00:00.000Z",
    },
    stats: {
      active_products: 0,
      pending_reservations: 0,
      reservations_this_month: 0,
      completed_this_month: 0,
      saved_this_month: { kg: 0, l: 0, pieces: 0 },
      value_this_month: 0,
    },
  };

  it("shows the branch's plan and balance with the same actions", async () => {
    apiMock.patch.mockResolvedValue({ data: { message: "Auto-renew turned on." } });
    renderWithProviders(<CompanyBranchDetailsPage />, {
      route: "/company/branches/21",
      path: "/company/branches/:id",
      user: hq,
      get: {
        "/company/branches/21": details,
        "/company/branches/21/products": () => ({ products: [], total: 0 }),
        "/company/branches/21/credits": {
          credits: makeCreditSummary({ managedByCompany: true, companyName: "Bingo d.o.o.", used: 46, available: 4 }),
          history: { year: 2030, months: [], categories: [] },
          requests: [],
          total: 0,
        },
      },
    });
    const card = (await screen.findByRole("heading", { name: t("company.credits.cardTitle") })).closest("section")!;
    expect(within(card).getByText("Standard")).toBeInTheDocument();
    expect(within(card).getByRole("progressbar").firstElementChild).toHaveClass("bg-red-500");
    expect(within(card).getByRole("button", { name: t("company.credits.choosePlan") })).toBeEnabled();
    expect(within(card).getByRole("button", { name: t("company.credits.addCredits") })).toBeEnabled();
    await userEvent.click(within(card).getByRole("switch", { name: t("credits.profile.autoRenew") }));
    expect(apiMock.patch).toHaveBeenCalledWith("/company/branches/21/credits/auto-renew", { auto_renew: true });
  });
});
