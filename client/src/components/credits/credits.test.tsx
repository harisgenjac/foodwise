import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { CreditsProvider } from "../../context/CreditsContext.js";
import CreditBanner from "./CreditBanner.js";
import CreditHint from "./CreditHint.js";
import { formatCreditMonth } from "../../utils/credits.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { apiMock, makeCreditSummary, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { CreditRequest, CreditSummary } from "../../types/index.js";

const PLANS = [
  { id: 1, name: "Basic", credits_per_period: 20, price: "15.00" },
  { id: 2, name: "Standard", credits_per_period: 50, price: "30.00" },
];
const PACKAGES = [{ id: 4, credits: 20, price: "15.00" }];
const PENDING_TOPUP: CreditRequest = {
  id: 9,
  user_id: 1,
  request_type: "TOPUP",
  plan_id: null,
  topup_package_id: 4,
  period_month: "2030-01-01",
  auto_renew: false,
  status: "PENDING",
  source: "USER",
  created_at: "2030-01-05T10:00:00.000Z",
  reviewed_at: null,
  requested_by: 1,
  company_note: null,
  company_reviewed_at: null,
  plan_name: null,
  credits: 20,
  price: "15.00",
};

const renderWithCredits = (
  ui: React.ReactElement,
  credits: CreditSummary,
  extraGet: Record<string, unknown> = {},
  route = "/my-profile",
) =>
  renderWithProviders(<CreditsProvider enabled>{ui}</CreditsProvider>, {
    route,
    path: "/my-profile",
    user: makeUser({ role: "STORE" }),
    get: {
      "/credits/me": { credits },
      "/credits/plans": { plans: PLANS },
      "/credits/topup-packages": { packages: PACKAGES },
      "/credits/requests": { requests: [] },
      ...extraGet,
    },
  });

describe("CreditBanner", () => {
  it("asks for a subscription when there is none", async () => {
    renderWithCredits(<CreditBanner />, makeCreditSummary({ subscription: null, hasActiveSubscription: false, total: 0, used: 0, available: 0 }));
    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(t("credits.banner.none"));
    expect(within(banner).getByRole("link")).toHaveAttribute("href", "/my-profile#subscription");
  });

  it("offers extra credits when none are left", async () => {
    renderWithCredits(<CreditBanner />, makeCreditSummary({ used: 50, available: 0 }));
    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(t("credits.banner.empty"));
    expect(within(banner).getByRole("link")).toHaveAttribute("href", "/my-profile#topup");
  });

  it("says a subscription request is waiting instead of asking for one", async () => {
    renderWithCredits(
      <CreditBanner />,
      makeCreditSummary({
        subscription: null,
        hasActiveSubscription: false,
        total: 0,
        used: 0,
        available: 0,
        pendingRequests: [{ ...PENDING_TOPUP, request_type: "SUBSCRIPTION", plan_id: 2, topup_package_id: null }],
      }),
    );
    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(t("credits.banner.pending"));
    expect(within(banner).getByRole("link", { name: t("credits.banner.pendingLink") })).toHaveAttribute(
      "href",
      "/my-profile#subscription",
    );
  });

  it("says a top-up is waiting when no credits are left", async () => {
    renderWithCredits(<CreditBanner />, makeCreditSummary({ used: 50, available: 0, pendingRequests: [PENDING_TOPUP] }));
    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(t("credits.banner.topupPending"));
    expect(banner).not.toHaveTextContent(t("credits.banner.empty"));
    expect(within(banner).getByRole("link")).toHaveAttribute("href", "/my-profile#topup");
  });

  it("says how many are left from 80% used, with a link to the Credits page", async () => {
    renderWithCredits(<CreditBanner />, makeCreditSummary({ used: 40, available: 10 }));
    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(t("credits.banner.low", { count: 10 }));
    expect(within(banner).getByRole("link")).toHaveAttribute("href", "/credits");
  });

  it("is compact on phones, with the link as a 44 px button next to the text", async () => {
    renderWithCredits(<CreditBanner />, makeCreditSummary({ used: 50, available: 0 }));
    const banner = await screen.findByRole("status");
    expect(banner).toHaveClass("px-3", "py-2", "mb-3", "sm:px-4", "sm:py-3", "sm:mb-6");
    expect(within(banner).getByRole("link")).toHaveClass("min-h-11", "sm:min-h-0");
  });

  it("stays hidden below 80%", async () => {
    renderWithCredits(
      <>
        <CreditBanner />
        <CreditHint />
      </>,
      makeCreditSummary({ used: 39, available: 11 }),
    );
    // The hint shows once the credits are loaded, so the banner had its chance too.
    expect(await screen.findByText(t("credits.hint.one", { left: 11 }))).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

