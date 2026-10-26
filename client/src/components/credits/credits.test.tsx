import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { CreditsProvider } from "../../context/CreditsContext.js";
import CreditBanner from "./CreditBanner.js";
import CreditHint from "./CreditHint.js";
import SubscriptionSection from "./SubscriptionSection.js";
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
    // Without a subscription the plans are shown right away, with no toggles.
    expect(screen.queryByRole("button", { name: t("credits.profile.choosePlanNext") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("credits.profile.buyTopup") })).not.toBeInTheDocument();
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

  const topupButton = () =>
    screen.getByRole("button", { name: new RegExp(`\\+${t("credits.profile.creditsCount", { count: 20 })}`) });

  it("keeps next month's plans behind a prominent toggle when the subscription ends, and closes it after a request", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderWithCredits(<SubscriptionSection role="RESTAURANT" />, makeCreditSummary());

    expect(await screen.findByText(t("credits.profile.endsOn", { date: formatDisplayDate("2030-01-31") }))).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: t("credits.profile.choosePlanNext") });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveClass("bg-orange-500");
    expect(screen.queryByRole("button", { name: t("credits.profile.choose") })).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const options = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    const months = t("dashboard.months", { returnObjects: true }) as string[];
    expect(
      screen.getByText(t("credits.profile.changePlan", { month: formatCreditMonth("2030-02-01", months) })),
    ).toBeInTheDocument();
    const [basic] = await within(options).findAllByRole("button", { name: t("credits.profile.choose") });
    await userEvent.click(basic!);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("credits.modal.submit") }));

    expect(apiMock.post).toHaveBeenCalledWith("/credits/requests", expect.objectContaining({ plan_id: 1, period: "next" }));
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
  });

  it("offers a quiet plan change while auto-renew is on", async () => {
    renderWithCredits(
      <SubscriptionSection role="STORE" />,
      makeCreditSummary({ subscription: { ...makeCreditSummary().subscription!, auto_renew: true } }),
    );

    expect(
      await screen.findByText(t("credits.profile.renewsOn", { plan: "Standard", date: formatDisplayDate("2030-02-01") })),
    ).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: t("credits.profile.changePlanNext") });
    expect(toggle).not.toHaveClass("bg-orange-500");
    expect(screen.queryByRole("button", { name: t("credits.profile.choosePlanNext") })).not.toBeInTheDocument();
  });

  it("shows no plan toggle once next month is approved or requested", async () => {
    const { unmount } = renderWithCredits(
      <SubscriptionSection role="STORE" />,
      makeCreditSummary({ nextSubscription: { ...makeCreditSummary().subscription!, id: 2, period_month: "2030-02-01" } }),
    );
    expect(await screen.findByText(t("credits.profile.planDecided"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("credits.profile.choosePlanNext") })).not.toBeInTheDocument();
    unmount();

    renderWithCredits(
      <SubscriptionSection role="STORE" />,
      makeCreditSummary({
        pendingRequests: [{ ...PENDING_TOPUP, id: 10, request_type: "SUBSCRIPTION", plan_id: 1, topup_package_id: null, period_month: "2030-02-01" }],
      }),
    );
    expect(await screen.findByText(t("credits.profile.planPending"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("credits.profile.choosePlanNext") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("credits.profile.changePlanNext") })).not.toBeInTheDocument();
  });

  it("keeps extra credits behind a toggle and closes it after a request", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    renderWithCredits(<SubscriptionSection role="RESTAURANT" />, makeCreditSummary());

    const toggle = await screen.findByRole("button", { name: t("credits.profile.buyTopup") });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "topup-options");
    await userEvent.click(toggle);
    await userEvent.click(within(document.getElementById("topup-options")!).getByRole("button"));

    // Nothing is sent before the user confirms in the dialog that explains extra credits.
    const dialog = screen.getByRole("dialog");
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent(t("credits.topupModal.what"));
    expect(dialog).toHaveTextContent(t("credits.topupModal.expiry", { date: formatDisplayDate("2030-01-31") }));
    expect(dialog).toHaveTextContent(t("credits.modal.chargeRestaurant"));
    await userEvent.click(within(dialog).getByRole("button", { name: t("credits.modal.submit") }));

    expect(apiMock.post).toHaveBeenCalledWith("/credits/requests", { request_type: "TOPUP", topup_package_id: 4 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
  });

  it("opens extra credits by default when no credits are left", async () => {
    renderWithCredits(<SubscriptionSection role="STORE" />, makeCreditSummary({ used: 50, available: 0 }));

    expect(await screen.findByRole("button", { name: t("credits.profile.buyTopup") })).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(t("credits.profile.price", { price: "15.00" }))).toBeInTheDocument();
  });

  it("opens and scrolls to the section from a #topup or #subscription link", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { unmount } = renderWithCredits(<SubscriptionSection role="STORE" />, makeCreditSummary(), {}, "/my-profile#topup");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: t("credits.profile.buyTopup") })).toHaveAttribute("aria-expanded", "true"),
    );
    expect(topupButton()).toBeInTheDocument();
    expect(scroll).toHaveBeenCalled();
    unmount();

    renderWithCredits(<SubscriptionSection role="STORE" />, makeCreditSummary(), {}, "/my-profile#subscription");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: t("credits.profile.choosePlanNext") })).toHaveAttribute("aria-expanded", "true"),
    );
    expect(await screen.findAllByRole("button", { name: t("credits.profile.choose") })).toHaveLength(2);
  });

  it("withdraws a pending request and toggles auto-renew", async () => {
    apiMock.delete.mockResolvedValue({ data: {} });
    apiMock.patch.mockResolvedValue({ data: {} });
    renderWithCredits(<SubscriptionSection role="STORE" />, makeCreditSummary({ pendingRequests: [PENDING_TOPUP] }));

    expect(await screen.findByText(t("credits.profile.topupPending"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("credits.profile.buyTopup") })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("credits.profile.withdraw") }));
    // A request the user sent can be sent again, so withdrawing it needs no confirmation.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock.delete).toHaveBeenCalledWith("/credits/requests/9");

    await userEvent.click(screen.getByRole("switch", { name: t("credits.profile.autoRenew") }));
    expect(apiMock.patch).toHaveBeenCalledWith("/credits/subscription/auto-renew", { auto_renew: true });
  });

  describe("a pending automatic renewal", () => {
    const RENEWAL: CreditRequest = {
      ...PENDING_TOPUP,
      id: 12,
      request_type: "SUBSCRIPTION",
      plan_id: 2,
      topup_package_id: null,
      period_month: "2030-02-01",
      auto_renew: true,
      source: "AUTO_RENEW",
      plan_name: "Standard",
      credits: 50,
    };
    const withRenewal = () =>
      makeCreditSummary({
        subscription: { ...makeCreditSummary().subscription!, auto_renew: true },
        pendingRequests: [RENEWAL],
      });
    // The server keeps the renewal and only turns its auto-renew off, so nothing is asked.
    it("turns auto-renew off at once, keeping the renewal", async () => {
      apiMock.patch.mockResolvedValue({ data: {} });
      renderWithCredits(<SubscriptionSection role="STORE" />, withRenewal());

      await userEvent.click(await screen.findByRole("switch", { name: t("credits.profile.autoRenew") }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(apiMock.patch).toHaveBeenCalledWith("/credits/subscription/auto-renew", { auto_renew: false });
      expect(apiMock.delete).not.toHaveBeenCalled();
    });

    it("confirms withdrawing the renewal request", async () => {
      apiMock.delete.mockResolvedValue({ data: {} });
      renderWithCredits(<SubscriptionSection role="STORE" />, withRenewal());

      await userEvent.click(await screen.findByRole("button", { name: t("credits.profile.withdraw") }));
      const dialog = screen.getByRole("dialog", { name: t("credits.renewalConfirm.withdrawTitle") });
      expect(dialog).toHaveTextContent(
        t("credits.renewalConfirm.withdrawText", {
          plan: "Standard",
          month: formatCreditMonth("2030-02-01", t("dashboard.months", { returnObjects: true }) as string[]),
        }),
      );
      expect(within(dialog).getByRole("button", { name: t("common.cancel") })).toHaveFocus();
      expect(apiMock.delete).not.toHaveBeenCalled();

      await userEvent.click(within(dialog).getByRole("button", { name: t("credits.renewalConfirm.withdrawButton") }));
      expect(apiMock.delete).toHaveBeenCalledWith("/credits/requests/12");
    });
  });

  it("shows the 10 newest requests and loads 10 more, keeping them after a withdrawal", async () => {
    apiMock.delete.mockResolvedValue({ data: {} });
    const requests = (limit: number) =>
      Array.from({ length: Math.min(limit, 15) }, (_, i) => ({
        ...PENDING_TOPUP,
        id: 100 + i,
        status: "REJECTED" as const,
        period_month: `2029-${String((i % 12) + 1).padStart(2, "0")}-01`,
      }));
    renderWithCredits(<SubscriptionSection role="STORE" />, makeCreditSummary({ pendingRequests: [PENDING_TOPUP] }), {
      "/credits/requests": (params: { limit: number }) => ({ requests: requests(params.limit), total: 15 }),
    });
    const requestParams = () =>
      apiMock.get.mock.calls.filter(([url]) => url === "/credits/requests").at(-1)?.[1]?.params;

    expect(await screen.findByText(t("common.showingOf", { shown: 10, total: 15 }))).toBeInTheDocument();
    expect(requestParams()).toEqual({ limit: 10 });

    await userEvent.click(screen.getByRole("button", { name: t("common.loadMore") }));
    await waitFor(() => expect(requestParams()).toEqual({ limit: 20 }));
    await waitFor(() => expect(screen.queryByRole("button", { name: t("common.loadMore") })).not.toBeInTheDocument());

    const requestCalls = () => apiMock.get.mock.calls.filter(([url]) => url === "/credits/requests").length;
    const before = requestCalls();
    await userEvent.click(screen.getByRole("button", { name: t("credits.profile.withdraw") }));
    expect(apiMock.delete).toHaveBeenCalledWith("/credits/requests/9");
    await waitFor(() => expect(requestCalls()).toBe(before + 1));
    expect(requestParams()).toEqual({ limit: 20 });
  });
});
