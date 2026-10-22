import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { CreditsProvider } from "../../context/CreditsContext.js";
import CreditBanner from "./CreditBanner.js";
import CreditHint from "./CreditHint.js";
import SubscriptionSection from "./SubscriptionSection.js";
import { formatCreditMonth } from "../../utils/credits.js";
import { apiMock, makeCreditSummary, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { CreditSummary } from "../../types/index.js";

const PLANS = [
  { id: 1, name: "Basic", credits_per_period: 20, price: "15.00" },
  { id: 2, name: "Standard", credits_per_period: 50, price: "30.00" },
];
const PACKAGES = [{ id: 4, credits: 20, price: "15.00" }];

const renderWithCredits = (ui: React.ReactElement, credits: CreditSummary, extraGet: Record<string, unknown> = {}) =>
  renderWithProviders(<CreditsProvider enabled>{ui}</CreditsProvider>, {
    route: "/my-profile",
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

  it("says how many are left from 80% used, with a link to the Credits page", async () => {
    renderWithCredits(<CreditBanner />, makeCreditSummary({ used: 40, available: 10 }));
    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(t("credits.banner.low", { count: 10 }));
    expect(within(banner).getByRole("link")).toHaveAttribute("href", "/credits");
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

describe("SubscriptionSection", () => {
  it("sends a subscription request for this month after the explanation, with auto-renew", async () => {
    const success = vi.spyOn(toast, "success");
    apiMock.post.mockResolvedValue({ data: {} });
    renderWithCredits(
      <SubscriptionSection role="STORE" />,
      makeCreditSummary({ subscription: null, hasActiveSubscription: false, total: 0, used: 0, available: 0 }),
    );

    expect(await screen.findByText(t("credits.profile.topupNeedsSubscription"))).toBeInTheDocument();
    const [, standard] = await screen.findAllByRole("button", { name: t("credits.profile.choose") });
    await userEvent.click(standard!);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(t("credits.modal.chargeStore"));
    expect(within(dialog).getByRole("button", { name: t("credits.profile.autoRenewTooltip") })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByLabelText(t("credits.modal.autoRenew")));
    await userEvent.click(within(dialog).getByRole("button", { name: t("credits.modal.submit") }));

    expect(apiMock.post).toHaveBeenCalledWith("/credits/requests", {
      request_type: "SUBSCRIPTION",
      plan_id: 2,
      period: "current",
      auto_renew: true,
    });
    expect(success).toHaveBeenCalledWith(t("credits.modal.sent"));
  });

  it("buys extra credits with an active subscription and changes the plan for next month", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderWithCredits(<SubscriptionSection role="RESTAURANT" />, makeCreditSummary());

    const months = t("dashboard.months", { returnObjects: true }) as string[];
    expect(
      await screen.findByText(t("credits.profile.changePlan", { month: formatCreditMonth("2030-02-01", months) })),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: new RegExp(`\\+${t("credits.profile.creditsCount", { count: 20 })}`) }));
    expect(apiMock.post).toHaveBeenCalledWith("/credits/requests", { request_type: "TOPUP", topup_package_id: 4 });

    const [basic] = screen.getAllByRole("button", { name: t("credits.profile.choose") });
    await userEvent.click(basic!);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("credits.modal.submit") }));
    expect(apiMock.post).toHaveBeenCalledWith("/credits/requests", expect.objectContaining({ plan_id: 1, period: "next" }));
  });

  it("withdraws a pending request and toggles auto-renew", async () => {
    apiMock.delete.mockResolvedValue({ data: {} });
    apiMock.patch.mockResolvedValue({ data: {} });
    const pending = {
      id: 9,
      user_id: 1,
      request_type: "TOPUP" as const,
      plan_id: null,
      topup_package_id: 4,
      period_month: "2030-01-01",
      auto_renew: false,
      status: "PENDING" as const,
      source: "USER" as const,
      created_at: "2030-01-05T10:00:00.000Z",
      reviewed_at: null,
      plan_name: null,
      credits: 20,
      price: "15.00",
    };
    renderWithCredits(<SubscriptionSection role="STORE" />, makeCreditSummary({ pendingRequests: [pending] }));

    expect(await screen.findByText(t("credits.profile.topupPending"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("credits.profile.withdraw") }));
    expect(apiMock.delete).toHaveBeenCalledWith("/credits/requests/9");

    await userEvent.click(screen.getByRole("switch", { name: t("credits.profile.autoRenew") }));
    expect(apiMock.patch).toHaveBeenCalledWith("/credits/subscription/auto-renew", { auto_renew: true });
  });
});
