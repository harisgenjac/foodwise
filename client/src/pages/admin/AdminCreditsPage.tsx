import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Coins, ListFilter, Search, WalletCards } from "lucide-react";
import { useFetch } from "../../hooks/useFetch.js";
import { useAdminPage, useAdminSort, useKeepPageInRange } from "../../hooks/useAdminPage.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Pagination from "../../components/admin/Pagination.js";
import SortableHeader from "../../components/admin/SortableHeader.js";
import { ADMIN_PAGE_SIZE, ROLE_STYLES } from "../../utils/admin.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { creditMonthEnd, currentCreditMonth, usageBarColor, usagePercent } from "../../utils/credits.js";
import type { AdminCreditUser, Plan } from "../../types/index.js";

// Sortable columns (the server whitelist of GET /admin/credits/overview).
const SORT_KEYS = ["used", "available", "total", "usage"];

// Every store's and restaurant's plan and balance for the current month. A row opens the user,
// where the ledger and manual adjustments are.
function AdminCreditsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  // A plan id or "none" (no subscription this month), kept in the URL: the dashboard links to ?plan=none.
  const [searchParams, setSearchParams] = useSearchParams();
  const plan = searchParams.get("plan") ?? "";
  const { page, offset, setPage } = useAdminPage();
  const { sort, dir, toggleSort } = useAdminSort(SORT_KEYS);
  const { data: users, total, loading, error } = useFetch<AdminCreditUser>("/admin/credits/overview", "users", {
    q,
    role,
    plan,
    sort,
    dir,
    limit: ADMIN_PAGE_SIZE,
    offset,
  });
  const { data: plans } = useFetch<Plan>("/admin/credits/plans", "plans", {});
  useKeepPageInRange(page, total, setPage);
  const roles = t("admin.roles", { returnObjects: true }) as Record<string, string>;
  const month = currentCreditMonth();
  const hasActiveFilters = Boolean(q || role || plan);

  // One URL update, so the plan and the reset to page 1 do not overwrite each other.
  const setPlan = (value: string) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (value) params.set("plan", value);
      else params.delete("plan");
      params.delete("page");
      return params;
    });
  };
  const sortProps = { sort, dir, onSort: toggleSort };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("admin.credits.title")}
        subtitle={t("admin.credits.subtitle", {
          from: formatDisplayDate(month),
          to: formatDisplayDate(creditMonthEnd(month)),
        })}
        icon={Coins}
        count={total === null ? undefined : t("admin.credits.count", { count: total })}
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setQ("");
          setRole("");
          setPlan("");
        }}
        columns={3}
      >
        <FilterField icon={Search}>
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={t("admin.credits.search")}
            aria-label={t("admin.credits.search")}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={ListFilter}>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            aria-label={t("admin.credits.columnRole")}
            className={inputStyle}
          >
            <option value="">{t("admin.credits.allRoles")}</option>
            <option value="STORE">{roles.STORE}</option>
            <option value="RESTAURANT">{roles.RESTAURANT}</option>
          </select>
        </FilterField>
        <FilterField icon={WalletCards}>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            aria-label={t("admin.credits.columnPlan")}
            className={inputStyle}
          >
            <option value="">{t("admin.credits.allPlans")}</option>
            {plans.map((option) => (
              <option key={option.id} value={String(option.id)}>
                {option.name}
              </option>
            ))}
            <option value="none">{t("admin.credits.noPlan")}</option>
          </select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <LoadErrorState />
      ) : users.length === 0 ? (
        <EmptyState icon={Coins} title={t("admin.credits.emptyTitle")} subtitle={t("admin.credits.emptySubtitle")} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("admin.credits.columnBusiness")}</th>
                  <th className="hidden px-4 py-3 lg:table-cell">{t("admin.credits.columnCompany")}</th>
                  <th className="px-4 py-3">{t("admin.credits.columnPlan")}</th>
                  <SortableHeader label={t("admin.credits.columnUsed")} sortKey="used" {...sortProps} className="px-4 py-3 text-right" />
                  <SortableHeader
                    label={t("admin.credits.columnAvailable")}
                    sortKey="available"
                    {...sortProps}
                    className="px-4 py-3 text-right"
                  />
                  <SortableHeader label={t("admin.credits.columnTotal")} sortKey="total" {...sortProps} className="px-4 py-3 text-right" />
                  <SortableHeader
                    label={t("admin.credits.columnUsage")}
                    sortKey="usage"
                    {...sortProps}
                    className="hidden px-4 py-3 md:table-cell"
                  />
                  <th className="px-4 py-3">{t("admin.credits.columnPending")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((row) => {
                  const percent = usagePercent(row.used, row.total);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => navigate(`/admin/users/${row.id}`)}
                      className="cursor-pointer transition-colors hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{row.business_name || row.email}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${ROLE_STYLES[row.role]}`}>
                            {roles[row.role]}
                          </span>
                          {row.business_name && row.email}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 text-teal-700 lg:table-cell">{row.company_name ?? ""}</td>
                      <td className="px-4 py-3">
                        {row.has_subscription ? (
                          <span className="font-medium text-gray-800">{row.plan_name}</span>
                        ) : (
                          <span className="text-gray-400">{t("admin.credits.noPlan")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.used}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.available}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.total}</td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full ${usageBarColor(percent)}`} style={{ width: `${percent}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.pending_requests > 0 && (
                          <Link
                            to={`/admin/credit-requests?user_id=${row.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                          >
                            {t("admin.credits.pendingCount", { count: row.pending_requests })}
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
        </>
      )}
    </div>
  );
}

export default AdminCreditsPage;
