import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreditsProvider } from "../../context/CreditsContext.js";
import CreditBanner from "./CreditBanner.js";
import CreditHint from "./CreditHint.js";
import InsufficientCreditsNotice from "./InsufficientCreditsNotice.js";
import SubscriptionSection from "./SubscriptionSection.js";
import { apiMock, makeCreditSummary, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { CreditRequest, CreditSummary } from "../../types/index.js";

// A branch (a store of a company): its headquarters chooses and pays the plan, so the branch sees
// who pays, never picks a plan or auto-renew, and asks its headquarters for extra credits.

const COMPANY = "Bingo d.o.o.";
const PACKAGES = [{ id: 4, credits: 20, price: "15.00" }];
const TOPUP: CreditRequest = {
  id: 9,
  user_id: 1,
  request_type: "TOPUP",
  plan_id: null,
  topup_package_id: 4,
  period_month: "2030-01-01",
  auto_renew: false,
  status: "COMPANY_REVIEW",
  source: "BRANCH",
  created_at: "2030-01-05T10:00:00.000Z",
  reviewed_at: null,
  requested_by: 1,
  company_note: null,
  company_reviewed_at: null,
  plan_name: null,
  credits: 20,
  price: "15.00",
};

const branchSummary = (overrides: Partial<CreditSummary> = {}) =>
  makeCreditSummary({ managedByCompany: true, companyName: COMPANY, ...overrides });
const NO_PLAN = { subscription: null, hasActiveSubscription: false, total: 0, used: 0, available: 0 };

const renderBranch = (ui: React.ReactElement, credits: CreditSummary, requests: CreditRequest[] = []) =>
  renderWithProviders(<CreditsProvider enabled>{ui}</CreditsProvider>, {
    route: "/my-profile",
    path: "/my-profile",
    user: makeUser({ role: "STORE", company_id: 3 }),
    get: {
      "/credits/me": { credits },
      "/credits/plans": { plans: [{ id: 1, name: "Basic", credits_per_period: 20, price: "15.00" }] },
      "/credits/topup-packages": { packages: PACKAGES },
      "/credits/requests": { requests, total: requests.length },
    },
  });

describe("a branch's subscription section", () => {
  it("shows the plan paid by the company, without plan choice or auto-renew", async () => {
    renderBranch(<SubscriptionSection role="STORE" />, branchSummary());
    expect(await screen.findByText(t("credits.profile.paidByCompany", { company: COMPANY }))).toBeInTheDocument();
    expect(screen.getByText(t("credits.profile.companyManagesPlan", { company: COMPANY }))).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("credits.profile.choose") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("credits.profile.choosePlanNext") })).not.toBeInTheDocument();
  });

  it("asks the headquarters for extra credits", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderBranch(<SubscriptionSection role="STORE" />, branchSummary());
    expect(await screen.findByRole("heading", { name: t("credits.profile.topupTitleCompany") })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("credits.profile.requestTopupFromCompany") }));
    await userEvent.click(await screen.findByRole("button", { name: /\+20/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(t("credits.topupModal.paymentByCompany", { company: COMPANY }));
    await userEvent.click(within(dialog).getByRole("button", { name: t("credits.modal.submit") }));
    expect(apiMock.post).toHaveBeenCalledWith("/credits/requests", { request_type: "TOPUP", topup_package_id: 4 });
  });

  it("shows a request waiting for the headquarters, which the branch can withdraw", async () => {
    apiMock.delete.mockResolvedValue({ data: {} });
    renderBranch(<SubscriptionSection role="STORE" />, branchSummary({ pendingRequests: [TOPUP] }));
    expect(
      await screen.findByText(t("credits.profile.topupPendingAtCompany", { company: COMPANY })),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("credits.profile.withdraw") }));
    expect(apiMock.delete).toHaveBeenCalledWith("/credits/requests/9");
  });

  it("cannot withdraw what the headquarters sent to the admin", async () => {
    renderBranch(
      <SubscriptionSection role="STORE" />,
      branchSummary({ pendingRequests: [{ ...TOPUP, status: "PENDING", source: "COMPANY", requested_by: 2 }] }),
    );
    expect(await screen.findByText(t("credits.profile.topupPending"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("credits.profile.withdraw") })).not.toBeInTheDocument();
  });

  it("shows the headquarters' note on a rejected request", async () => {
    renderBranch(<SubscriptionSection role="STORE" />, branchSummary(), [
      { ...TOPUP, status: "COMPANY_REJECTED", company_note: "Ne ovaj mjesec." },
    ]);
    expect(await screen.findByText(t("credits.profile.companyNote", { note: "Ne ovaj mjesec." }))).toBeInTheDocument();
    expect(screen.getByText(t("credits.requestStatuses.COMPANY_REJECTED"))).toBeInTheDocument();
  });
});

describe("a branch's banners and hints", () => {
  it("says the company has not chosen a plan, with nothing to buy", async () => {
    renderBranch(
      <>
        <CreditBanner />
        <CreditHint />
      </>,
      branchSummary(NO_PLAN),
    );
    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(t("credits.banner.companyNone", { company: COMPANY }));
    expect(within(banner).queryByRole("link")).not.toBeInTheDocument();
    // The hint below the form says the same.
    expect(screen.getAllByText(t("credits.hint.noCompanyPlan", { company: COMPANY }))).toHaveLength(2);
  });

  it("links to the top-up request from the headquarters when no credits are left or at 80%", async () => {
    const { unmount } = renderBranch(<CreditBanner />, branchSummary({ used: 50, available: 0 }));
    const empty = await screen.findByRole("status");
    expect(empty).toHaveTextContent(t("credits.banner.companyEmpty"));
    expect(within(empty).getByRole("link", { name: t("credits.banner.companyTopupLink") })).toHaveAttribute(
      "href",
      "/my-profile#topup",
    );
    unmount();

    renderBranch(<CreditBanner />, branchSummary({ used: 40, available: 10 }));
    const low = await screen.findByRole("status");
    expect(low).toHaveTextContent(t("credits.banner.low", { count: 10 }));
    expect(within(low).getByRole("link", { name: t("credits.banner.companyTopupLink") })).toHaveAttribute(
      "href",
      "/my-profile#topup",
    );
  });

  it("turns a refusal into a top-up request from the headquarters", async () => {
    const { unmount } = renderBranch(
      <InsufficientCreditsNotice error={{ hasActiveSubscription: true, actionUrl: "/my-profile#topup" }} />,
      branchSummary({ used: 50, available: 0 }),
    );
    expect(await screen.findByRole("link", { name: t("credits.insufficient.companyTopupLink") })).toHaveAttribute(
      "href",
      "/my-profile#topup",
    );
    unmount();

    renderBranch(
      <InsufficientCreditsNotice error={{ hasActiveSubscription: false, actionUrl: "/my-profile#subscription" }} />,
      branchSummary(NO_PLAN),
    );
    expect(await screen.findByText(t("credits.insufficient.noCompanyPlan", { company: COMPANY }))).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
