import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CalendarCheck,
  Coins,
  HeartHandshake,
  Inbox,
  Leaf,
  Package,
  ShieldCheck,
  Store,
  UserPlus,
  WalletCards,
} from "lucide-react";
import api from "../../api/axios.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import OverviewPanel from "../../components/admin/overview/OverviewPanel.js";
import KpiStrip from "../../components/admin/overview/KpiStrip.js";
import DistributionBar from "../../components/admin/overview/DistributionBar.js";
import AttentionList from "../../components/admin/overview/AttentionList.js";
import { formatCreditMonth, usagePercent } from "../../utils/credits.js";
import { formatSavedFood } from "../../utils/savedFood.js";
import type { AdminStats } from "../../types/index.js";

// Bar colors by meaning, ordered so that easily confused hues (amber/red, amber/green) are not
// neighbours; gray marks closed or removed items. Every bar has a legend with counts.
const RESERVATION_COLORS = {
  Confirmed: "bg-green-600",
  Completed: "bg-blue-600",
  Pending: "bg-amber-600",
  Cancelled: "bg-slate-500",
  Rejected: "bg-red-600",
} as const;
const PRODUCT_COLORS = { active: "bg-green-600", sold: "bg-blue-600", expired: "bg-amber-600", removed: "bg-slate-500" } as const;
const DONATION_COLORS = { available: "bg-green-600", removed: "bg-slate-500", expired: "bg-amber-600" } as const;
// Plans from small to large on one orange ramp, light to dark.
const PLAN_COLORS = ["bg-orange-300", "bg-orange-500", "bg-orange-700", "bg-orange-900"];

// Admin landing page: headline numbers, what needs attention, and one panel per area with its
// distribution, instead of a wall of equal cards.
function AdminDashboardPage() {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get("/admin/stats")
      .then((response) => setStats(response.data.stats))
      .catch((err) => {
        console.error(err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const number = (value: number, digits = 0) =>
    value.toLocaleString(i18n.language, { maximumFractionDigits: digits });
  const money = (value: number) =>
    `${value.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KM`;
  const reservationStatuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;
  const productStatuses = t("productStatus", { returnObjects: true }) as Record<string, string>;
  const donationStatuses = t("donations.statuses", { returnObjects: true }) as Record<string, string>;
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];
  const viewAll = t("admin.dashboard.viewAll");

  const header = (
    <ProductPageHeader
      title={t("admin.dashboard.title")}
      subtitle={t("admin.dashboard.subtitle")}
      icon={ShieldCheck}
      action={{ to: "/admin/users/new", label: t("admin.dashboard.newUser"), icon: UserPlus }}
    />
  );

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-16">
        {header}
        <LoadErrorState />
      </div>
    );
  }

  const { users, credits } = stats;
  const businesses = users.stores + users.restaurants;
  const month = formatCreditMonth(credits.period_start, monthNames);
  const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);
  const subscribedPercent = usagePercent(credits.active_subscriptions, businesses);
  const savedFood = formatSavedFood(stats.saved, t("dashboard.piecesShort"));

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      {header}

      <KpiStrip
        items={[
          {
            icon: Store,
            label: t("admin.dashboard.kpiBusinesses"),
            value: number(businesses),
            detail: t("admin.dashboard.kpiBusinessesDetail", { stores: users.stores, restaurants: users.restaurants }),
          },
          {
            icon: WalletCards,
            label: t("admin.dashboard.kpiSubscriptions", { month }),
            value: `${credits.active_subscriptions} / ${businesses}`,
            progress: subscribedPercent,
            detail: t("admin.dashboard.kpiSubscriptionsDetail", { percent: Math.round(subscribedPercent) }),
          },
          {
            icon: Coins,
            label: t("admin.dashboard.kpiCreditsUsed"),
            value: number(credits.credits_used),
            detail: t("admin.dashboard.kpiCreditsUsedDetail", { month }),
          },
          {
            icon: Leaf,
            label: t("admin.dashboard.kpiFoodSaved"),
            // Same rules as the store card: the first non-zero unit is the number, the others are chips.
            value: savedFood[0] ?? "0 kg",
            units: savedFood.slice(1),
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Only requests wait for the admin; anything else is handled from its list when needed. */}
        {credits.pending_requests > 0 && (
          <OverviewPanel title={t("admin.dashboard.attentionTitle")} icon={AlertTriangle}>
            <AttentionList
              items={[
                {
                  icon: Inbox,
                  text: t("admin.dashboard.attention.pendingRequests", { count: credits.pending_requests }),
                  to: "/admin/credit-requests?status=PENDING",
                },
              ]}
            />
          </OverviewPanel>
        )}

        <OverviewPanel
          title={t("admin.dashboard.creditsTitle")}
          subtitle={month}
          icon={WalletCards}
          link={{ to: "/admin/credits", label: viewAll }}
          className={credits.pending_requests > 0 ? "lg:col-span-2" : "lg:col-span-3"}
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <DistributionBar
              label={t("admin.dashboard.subscriptionsByPlan")}
              totalLabel={t("admin.dashboard.subscriptionsTotal", { count: credits.active_subscriptions })}
              items={credits.by_plan.map((row, index) => ({
                label: row.plan,
                value: row.count,
                color: PLAN_COLORS[index] ?? "bg-orange-900",
              }))}
            />
            <dl className="space-y-2 text-sm">
              {(
                [
                  [t("admin.dashboard.autoRenew"), credits.auto_renew],
                  [t("admin.dashboard.nextMonthSubscriptions"), credits.next_month_subscriptions],
                  // Opens the credits list filtered to the businesses without a subscription.
                  [t("admin.dashboard.withoutSubscription"), credits.without_subscription, "/admin/credits?plan=none"],
                  [t("admin.dashboard.pendingCreditRequests"), credits.pending_requests],
                ] as [string, number, string?][]
              ).map(([label, value, to]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2 last:border-0">
                  <dt className="text-gray-600">
                    {to ? (
                      <Link to={to} className="hover:text-orange-600 hover:underline">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </dt>
                  <dd className="font-semibold tabular-nums text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </OverviewPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <OverviewPanel
          title={t("admin.dashboard.reservationsSection")}
          icon={CalendarCheck}
          link={{ to: "/admin/reservations", label: viewAll }}
        >
          <DistributionBar
            label={t("admin.dashboard.reservationsSection")}
            totalLabel={t("admin.dashboard.total", { count: sum(stats.reservations) })}
            items={(Object.keys(RESERVATION_COLORS) as (keyof typeof RESERVATION_COLORS)[]).map((status) => ({
              label: reservationStatuses[status] ?? status,
              value: stats.reservations[status],
              color: RESERVATION_COLORS[status],
            }))}
          />
        </OverviewPanel>
        <OverviewPanel title={t("admin.dashboard.offersSection")} icon={Package} link={{ to: "/admin/products", label: viewAll }}>
          <DistributionBar
            label={t("admin.dashboard.offersSection")}
            totalLabel={t("admin.dashboard.total", { count: sum(stats.products) })}
            items={[
              { label: t("admin.dashboard.activeProducts"), value: stats.products.active, color: PRODUCT_COLORS.active },
              { label: productStatuses.Sold ?? "Sold", value: stats.products.sold, color: PRODUCT_COLORS.sold },
              { label: productStatuses.Expired ?? "Expired", value: stats.products.expired, color: PRODUCT_COLORS.expired },
              { label: productStatuses.Removed ?? "Removed", value: stats.products.removed, color: PRODUCT_COLORS.removed },
            ]}
          />
        </OverviewPanel>
        <OverviewPanel
          title={t("admin.dashboard.donationsSection")}
          icon={HeartHandshake}
          link={{ to: "/admin/donations", label: viewAll }}
        >
          <DistributionBar
            label={t("admin.dashboard.donationsSection")}
            totalLabel={t("admin.dashboard.total", { count: sum(stats.donations) })}
            items={[
              { label: donationStatuses.Available ?? "Active", value: stats.donations.available, color: DONATION_COLORS.available },
              { label: donationStatuses.Removed ?? "Removed", value: stats.donations.removed, color: DONATION_COLORS.removed },
              { label: donationStatuses.Expired ?? "Expired", value: stats.donations.expired, color: DONATION_COLORS.expired },
            ]}
          />
        </OverviewPanel>
      </div>

      <OverviewPanel title={t("admin.dashboard.impactSection")} subtitle={t("admin.dashboard.impactSubtitle")} icon={Leaf}>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            [t("admin.dashboard.savedKg"), number(stats.saved.kg, 1)],
            [t("admin.dashboard.savedL"), number(stats.saved.l, 1)],
            [t("admin.dashboard.savedPieces"), number(stats.saved.pieces)],
            [t("admin.dashboard.value"), money(stats.saved.value)],
            [t("admin.dashboard.savings"), money(stats.saved.savings)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="mt-1 text-xl font-bold tracking-tight text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </OverviewPanel>
    </div>
  );
}

export default AdminDashboardPage;
