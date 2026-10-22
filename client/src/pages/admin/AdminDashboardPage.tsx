import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  CalendarCheck,
  CalendarX,
  CircleCheck,
  Clock,
  Coins,
  CalendarClock,
  Droplets,
  HeartHandshake,
  Inbox,
  Leaf,
  Package,
  PackageCheck,
  PackageX,
  PiggyBank,
  Repeat,
  ShieldCheck,
  Store,
  Trash2,
  UserPlus,
  UserRoundX,
  WalletCards,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import api from "../../api/axios.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import StatCard from "../../components/dashboard/StatCard.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import type { AdminStats } from "../../types/index.js";
import { formatCreditMonth } from "../../utils/credits.js";

type Tone = "orange" | "amber" | "green" | "red" | "gray";

interface Stat {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: Tone;
}

// An optional link next to the title leads to the page behind the numbers.
function StatSection({ title, stats, link }: { title: string; stats: Stat[]; link?: { to: string; label: string } }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
        {link && (
          <Link to={link.to} className="text-sm font-semibold text-orange-600 hover:text-orange-700">
            {link.label}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} tone={stat.tone ?? "orange"} />
        ))}
      </div>
    </section>
  );
}

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
  const statuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <ProductPageHeader
        title={t("admin.dashboard.title")}
        subtitle={t("admin.dashboard.subtitle")}
        icon={ShieldCheck}
        action={{ to: "/admin/users/new", label: t("admin.dashboard.newUser"), icon: UserPlus }}
      />

      {error || !stats ? (
        <LoadErrorState />
      ) : (
        <>
          <StatSection
            title={t("admin.dashboard.usersSection")}
            stats={[
              { icon: Store, label: t("admin.dashboard.stores"), value: stats.users.stores },
              { icon: UtensilsCrossed, label: t("admin.dashboard.restaurants"), value: stats.users.restaurants },
              { icon: UserRoundX, label: t("admin.dashboard.blocked"), value: stats.users.blocked, tone: "red" },
              { icon: Clock, label: t("admin.dashboard.incompleteProfiles"), value: stats.users.incomplete_profiles, tone: "amber" },
            ]}
          />
          <StatSection
            title={t("admin.dashboard.creditsSection", { month: formatCreditMonth(stats.credits.period_start, monthNames) })}
            link={{ to: "/admin/credit-requests?status=PENDING", label: t("admin.dashboard.viewRequests") }}
            stats={[
              { icon: WalletCards, label: t("admin.dashboard.activeSubscriptions"), value: stats.credits.active_subscriptions, tone: "green" },
              ...stats.credits.by_plan.map((row) => ({
                icon: Coins,
                label: t("admin.dashboard.planSubscriptions", { plan: row.plan }),
                value: row.count,
              })),
              { icon: UserRoundX, label: t("admin.dashboard.withoutSubscription"), value: stats.credits.without_subscription, tone: "amber" },
              { icon: Inbox, label: t("admin.dashboard.pendingCreditRequests"), value: stats.credits.pending_requests, tone: "amber" },
              { icon: Repeat, label: t("admin.dashboard.autoRenew"), value: stats.credits.auto_renew, tone: "gray" },
              { icon: CalendarClock, label: t("admin.dashboard.nextMonthSubscriptions"), value: stats.credits.next_month_subscriptions, tone: "gray" },
              { icon: Coins, label: t("admin.dashboard.creditsUsed"), value: number(stats.credits.credits_used) },
            ]}
          />
          <StatSection
            title={t("admin.dashboard.offersSection")}
            stats={[
              { icon: Package, label: t("admin.dashboard.activeProducts"), value: stats.products.active, tone: "green" },
              { icon: PackageCheck, label: t("admin.dashboard.soldProducts"), value: stats.products.sold },
              { icon: PackageX, label: t("admin.dashboard.expiredProducts"), value: stats.products.expired, tone: "red" },
              { icon: Trash2, label: t("admin.dashboard.removedProducts"), value: stats.products.removed, tone: "gray" },
            ]}
          />
          <StatSection
            title={t("admin.dashboard.reservationsSection")}
            stats={[
              { icon: Clock, label: statuses.Pending ?? "Pending", value: stats.reservations.Pending, tone: "amber" },
              { icon: CalendarCheck, label: statuses.Confirmed ?? "Confirmed", value: stats.reservations.Confirmed, tone: "green" },
              { icon: CircleCheck, label: statuses.Completed ?? "Completed", value: stats.reservations.Completed, tone: "gray" },
              {
                icon: XCircle,
                label: `${statuses.Rejected ?? "Rejected"} / ${statuses.Cancelled ?? "Cancelled"}`,
                value: stats.reservations.Rejected + stats.reservations.Cancelled,
                tone: "red",
              },
            ]}
          />
          <StatSection
            title={t("admin.dashboard.impactSection")}
            stats={[
              { icon: Leaf, label: t("admin.dashboard.savedKg"), value: number(stats.saved.kg, 1), tone: "green" },
              { icon: Droplets, label: t("admin.dashboard.savedL"), value: number(stats.saved.l, 1), tone: "green" },
              { icon: Package, label: t("admin.dashboard.savedPieces"), value: number(stats.saved.pieces), tone: "green" },
              { icon: PiggyBank, label: t("admin.dashboard.savings"), value: money(stats.saved.savings), tone: "green" },
            ]}
          />
          <StatSection
            title={t("admin.dashboard.donationsSection")}
            stats={[
              { icon: HeartHandshake, label: t("admin.dashboard.availableDonations"), value: stats.donations.available, tone: "green" },
              { icon: CalendarX, label: t("admin.dashboard.expiredDonations"), value: stats.donations.expired, tone: "red" },
              { icon: Ban, label: t("admin.dashboard.removedDonations"), value: stats.donations.removed, tone: "gray" },
            ]}
          />
        </>
      )}
    </div>
  );
}

export default AdminDashboardPage;
