import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarCheck, Coins, Leaf, Store } from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import EmptyState from "../../components/product/EmptyState.js";
import DashboardHero from "../../components/dashboard/DashboardHero.js";
import StatCard from "../../components/dashboard/StatCard.js";
import UsageBar from "../../components/credits/UsageBar.js";
import CompanyDecisions from "../../components/company/CompanyDecisions.js";
import { BRANCH_STATUS_STYLES } from "../../utils/branches.js";
import { usagePercent, usageTone } from "../../utils/credits.js";
import { formatSavedFood } from "../../utils/savedFood.js";
import type { CompanyDashboard } from "../../types/index.js";

// The headquarters' start page ("Pregled"): what waits for its decision, this month's totals of
// the company and a row per branch. Credits follow the credit month, reservations and food saved
// the business month, like the Credits page and the store dashboard.
function CompanyOverviewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<CompanyDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    () =>
      api
        .get("/company/dashboard")
        .then((response) => setDashboard(response.data))
        .catch((err) => console.error("Error loading the dashboard:", err))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSpinner />;
  if (!dashboard) return <LoadErrorState />;

  const { totals, branches } = dashboard;
  const newBranch = { to: "/company/branches/new", label: t("company.branches.newBranch"), icon: Store };
  const savedUnits = formatSavedFood(totals.saved, t("dashboard.piecesShort"));
  const cell = "px-3 py-3";
  const head = "px-3 py-2";

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <DashboardHero
        title={dashboard.company.name}
        subtitle={
          user?.first_name
            ? `${t("company.overview.greeting", { name: user.first_name })}. ${t("company.overview.subtitle")}`
            : t("company.overview.subtitle")
        }
        action={newBranch}
      />

      {branches.length === 0 ? (
        <EmptyState
          icon={Store}
          title={t("company.overview.noBranchesTitle")}
          subtitle={t("company.overview.noBranchesSubtitle")}
          action={{ to: newBranch.to, label: newBranch.label }}
        />
      ) : (
        <>
          <CompanyDecisions dashboard={dashboard} onChanged={load} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Store}
              label={t("company.overview.statBranches")}
              value={t("company.overview.branchesValue", {
                active: totals.branches.active,
                all: totals.branches.all,
              })}
              tone="green"
            >
              {totals.branches.deactivated > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {t("company.overview.deactivated", { count: totals.branches.deactivated })}
                </p>
              )}
            </StatCard>
            <StatCard
              icon={Coins}
              label={t("company.overview.statCredits")}
              value={t("company.overview.creditsValue", totals.credits)}
              tone={usageTone(usagePercent(totals.credits.used, totals.credits.total))}
            >
              <UsageBar
                used={totals.credits.used}
                total={totals.credits.total}
                label={t("company.overview.creditsUsage")}
                className="mt-2"
              />
            </StatCard>
            <StatCard
              icon={CalendarCheck}
              label={t("company.overview.statReservations")}
              value={totals.reservations.total}
              tone="amber"
            >
              <p className="mt-1 text-xs text-gray-500">
                {t("company.overview.reservationsDetail", {
                  pickedUp: totals.reservations.picked_up,
                  pending: totals.reservations.pending,
                })}
              </p>
            </StatCard>
            <StatCard
              icon={Leaf}
              label={t("company.overview.statSaved")}
              value={t("company.overview.savedValue", { value: totals.saved.value.toFixed(2) })}
              units={savedUnits}
              tone="green"
            />
          </div>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm" aria-labelledby="company-branches">
            <div className="flex items-center justify-between gap-4">
              <h2 id="company-branches" className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <Store className="h-5 w-5 text-orange-600" />
                {t("company.overview.branchesTitle")}
              </h2>
              <Link
                to="/company/branches"
                className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
              >
                {t("company.overview.viewBranches")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className={head}>{t("company.overview.columnBranch")}</th>
                    <th className={`hidden md:table-cell ${head}`}>{t("company.overview.columnCity")}</th>
                    <th className={head}>{t("company.overview.columnStatus")}</th>
                    <th className={`hidden md:table-cell ${head}`}>{t("company.overview.columnPlan")}</th>
                    <th className={head}>{t("company.overview.columnCredits")}</th>
                    <th className={`hidden lg:table-cell ${head}`}>{t("company.overview.columnOffers")}</th>
                    <th className={`hidden lg:table-cell ${head}`}>{t("company.overview.columnPending")}</th>
                    <th className={`hidden lg:table-cell ${head}`}>{t("company.overview.columnPickedUp")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {branches.map((branch) => (
                    <tr key={branch.id} data-testid={`dashboard-branch-${branch.id}`}>
                      <td className={cell}>
                        <Link
                          to={`/company/branches/${branch.id}`}
                          className="font-medium text-gray-900 hover:text-orange-600"
                        >
                          {branch.name}
                        </Link>
                      </td>
                      <td className={`hidden md:table-cell ${cell} text-gray-600`}>{branch.city ?? "—"}</td>
                      <td className={cell}>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BRANCH_STATUS_STYLES[branch.status]}`}
                        >
                          {t(`company.branchStatus.${branch.status}`)}
                        </span>
                      </td>
                      <td className={`hidden md:table-cell ${cell} text-gray-700`}>
                        {branch.plan_name ?? t("company.credits.noPlan")}
                      </td>
                      <td className={`${cell} min-w-40`}>
                        <UsageBar
                          used={branch.used}
                          total={branch.total}
                          label={t("company.credits.branchUsage", { branch: branch.name })}
                        />
                      </td>
                      <td className={`hidden lg:table-cell ${cell} tabular-nums`}>{branch.active_products}</td>
                      <td className={`hidden lg:table-cell ${cell} tabular-nums`}>{branch.pending_reservations}</td>
                      <td className={`hidden lg:table-cell ${cell} tabular-nums`}>{branch.completed_this_month}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default CompanyOverviewPage;
