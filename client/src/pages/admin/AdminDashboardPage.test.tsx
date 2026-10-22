import { render, screen, within } from "@testing-library/react";
import AdminDashboardPage from "./AdminDashboardPage.js";
import DistributionBar from "../../components/admin/overview/DistributionBar.js";
import { axiosError, makeUser, renderWithProviders, t } from "../../test/utils.js";
import type { AdminStats } from "../../types/index.js";

const admin = makeUser({ role: "ADMIN" });

const STATS: AdminStats = {
  users: { stores: 3, restaurants: 2, admins: 1, blocked: 1, incomplete_profiles: 0 },
  products: { active: 6, sold: 2, expired: 1, removed: 1 },
  reservations: { Pending: 2, Confirmed: 3, Completed: 1, Rejected: 1, Cancelled: 1 },
  saved: { kg: 41.5, l: 12, pieces: 30, value: 520, savings: 310 },
  donations: { available: 4, expired: 1, removed: 0 },
  credits: {
    period_start: "2030-01-01",
    active_subscriptions: 4,
    by_plan: [
      { plan: "Basic", count: 1 },
      { plan: "Standard", count: 3 },
      { plan: "Pro", count: 0 },
    ],
    auto_renew: 2,
    next_month_subscriptions: 1,
    without_subscription: 1,
    pending_requests: 2,
    credits_used: 37,
  },
};

const renderPage = (stats: AdminStats | Error) =>
  renderWithProviders(<AdminDashboardPage />, {
    route: "/admin",
    path: "/admin",
    user: admin,
    get: { "/admin/stats": stats instanceof Error ? stats : { stats } },
  });

describe("AdminDashboardPage", () => {
  it("shows the headline numbers", async () => {
    renderPage(STATS);

    expect(await screen.findByText(t("admin.dashboard.kpiBusinesses"))).toBeInTheDocument();
    expect(screen.getByText("4 / 5")).toBeInTheDocument();
    expect(screen.getByText(t("admin.dashboard.kpiSubscriptionsDetail", { percent: 80 }))).toBeInTheDocument();
    expect(screen.getByText("37")).toBeInTheDocument();
    expect(screen.getByText(t("admin.dashboard.kpiBusinessesDetail", { stores: 3, restaurants: 2 }))).toBeInTheDocument();
  });

  it("lists only what needs attention, each linking to its list", async () => {
    renderPage(STATS);

    const requests = await screen.findByRole("link", {
      name: t("admin.dashboard.attention.pendingRequests", { count: 2 }),
    });
    expect(requests).toHaveAttribute("href", "/admin/credit-requests?status=PENDING");
    expect(
      screen.getByRole("link", { name: t("admin.dashboard.attention.pendingReservations", { count: 2 }) }),
    ).toHaveAttribute("href", "/admin/reservations");
    expect(screen.getByRole("link", { name: t("admin.dashboard.attention.blocked", { count: 1 }) })).toBeInTheDocument();
    // No incomplete profiles: no row for them.
    expect(screen.queryByText(t("admin.dashboard.attention.incompleteProfiles", { count: 0 }))).not.toBeInTheDocument();
  });

  it("says all is done when nothing waits", async () => {
    renderPage({
      ...STATS,
      users: { ...STATS.users, blocked: 0 },
      reservations: { ...STATS.reservations, Pending: 0 },
      credits: { ...STATS.credits, pending_requests: 0, without_subscription: 0 },
    });
    expect(await screen.findByText(t("admin.dashboard.allClear"))).toBeInTheDocument();
  });

  it("shows each area as a bar with a legend of counts", async () => {
    renderPage(STATS);

    const plans = await screen.findByRole("img", { name: /Basic 1, Standard 3, Pro 0/ });
    // Pro has no subscriptions: it stays in the legend but takes no space in the bar.
    expect(within(plans).getAllByTestId("distribution-segment")).toHaveLength(2);
    const statuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;
    expect(screen.getByRole("img", { name: new RegExp(`${statuses.Pending} 2`) })).toBeInTheDocument();
    expect(screen.getByText(t("admin.dashboard.total", { count: 8 }))).toBeInTheDocument();
    expect(screen.getByText(t("admin.dashboard.subscriptionsTotal", { count: 4 }))).toBeInTheDocument();
  });

  it("shows the load error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage(axiosError(500));
    expect(await screen.findByText(t("common.loadErrorTitle"))).toBeInTheDocument();
  });
});

describe("DistributionBar", () => {
  it("sizes segments by share and leaves out empty ones", () => {
    render(
      <DistributionBar
        label="Status"
        totalLabel="4 total"
        items={[
          { label: "A", value: 1, color: "bg-green-600" },
          { label: "B", value: 3, color: "bg-blue-600" },
          { label: "C", value: 0, color: "bg-slate-500" },
        ]}
      />,
    );
    const segments = screen.getAllByTestId("distribution-segment");
    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveStyle({ width: "25%" });
    expect(segments[1]).toHaveStyle({ width: "75%" });
    expect(screen.getByRole("img")).toHaveAccessibleName("Status: A 1, B 3, C 0");
    expect(screen.getByText("C")).toBeInTheDocument();
  });
});
