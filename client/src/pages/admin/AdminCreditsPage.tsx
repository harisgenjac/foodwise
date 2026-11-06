import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Coins, Search, WalletCards } from "lucide-react";
import { useFetch } from "../../hooks/useFetch.js";
import { useAdminPage, useAdminSort, useKeepPageInRange } from "../../hooks/useAdminPage.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Pagination from "../../components/admin/Pagination.js";
import DataTable, { type DataColumn } from "../../components/common/DataTable.js";
import { ADMIN_PAGE_SIZE } from "../../utils/admin.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { creditMonthEnd, currentCreditMonth, usageBarColor, usagePercent } from "../../utils/credits.js";
import type { AdminCreditUser, Plan } from "../../types/index.js";

// Sortable columns (the server whitelist of GET /admin/credits/overview).
const SORT_KEYS = ["used", "available", "total", "usage"];

// Every store's plan and balance for the current month (restaurants pay no credits). A row opens the user,
// where the ledger and manual adjustments are.
function AdminCreditsPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  // A plan id or "none" (no subscription this month), kept in the URL: the dashboard links to ?plan=none.
  const [searchParams, setSearchParams] = useSearchParams();
  const plan = searchParams.get("plan") ?? "";
  const { page, offset, setPage } = useAdminPage();
  const { sort, dir, toggleSort, setSort } = useAdminSort(SORT_KEYS);
  const { data: users, total, loading, error } = useFetch<AdminCreditUser>("/admin/credits/overview", "users", {
    q,
    plan,
    sort,
    dir,
    limit: ADMIN_PAGE_SIZE,
    offset,
  });
  const { data: plans } = useFetch<Plan>("/admin/credits/plans", "plans", {});
  useKeepPageInRange(page, total, setPage);
  const month = currentCreditMonth();
  const hasActiveFilters = Boolean(q || plan);

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
  const columns: DataColumn<AdminCreditUser>[] = [
    {
      id: "business",
      header: t("admin.credits.columnBusiness"),
      card: "title",
      cell: (row) => (
        <>
          <p className="font-medium text-gray-900">{row.business_name || row.email}</p>
          {row.business_name && <p className="mt-0.5 text-xs text-gray-500">{row.email}</p>}
        </>
      ),
    },
    {
      id: "company",
      header: t("admin.credits.columnCompany"),
      className: "hidden lg:table-cell",
      cellClassName: "text-teal-700",
      cell: (row) => row.company_name ?? "",
    },
    {
      id: "plan",
      header: t("admin.credits.columnPlan"),
      card: "status",
      cell: (row) =>
        row.has_subscription ? (
          <span className="font-medium text-gray-800">{row.plan_name}</span>
        ) : (
          <span className="text-gray-400">{t("admin.credits.noPlan")}</span>
        ),
      cardCell: (row) => (
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
            row.has_subscription ? "bg-orange-50 text-orange-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {row.has_subscription ? row.plan_name : t("admin.credits.noPlan")}
        </span>
      ),
    },
    {
      id: "used",
      header: t("admin.credits.columnUsed"),
      sortKey: "used",
      className: "text-right",
      cellClassName: "tabular-nums",
      cell: (row) => row.used,
    },
    {
      id: "available",
      header: t("admin.credits.columnAvailable"),
      sortKey: "available",
      className: "text-right",
      cellClassName: "font-semibold tabular-nums",
      cell: (row) => row.available,
      cardCell: (row) => <span className="font-semibold tabular-nums">{row.available}</span>,
    },
    {
      id: "total",
      header: t("admin.credits.columnTotal"),
      sortKey: "total",
      className: "text-right",
      cellClassName: "tabular-nums",
      cell: (row) => row.total,
    },
    {
      id: "usage",
      header: t("admin.credits.columnUsage"),
      sortKey: "usage",
      className: "hidden md:table-cell",
      card: "none",
      cell: (row) => {
        const percent = usagePercent(row.used, row.total);
        return (
          <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full ${usageBarColor(percent)}`} style={{ width: `${percent}%` }} />
          </div>
        );
      },
    },
    {
      id: "pending",
      header: t("admin.credits.columnPending"),
      card: "actions",
      cell: (row) =>
        row.pending_requests > 0 && (
          <Link
            to={`/admin/credit-requests?user_id=${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          >
            {t("admin.credits.pendingCount", { count: row.pending_requests })}
          </Link>
        ),
      cardCell: (row) =>
        row.pending_requests > 0 && (
          <Link
            to={`/admin/credit-requests?user_id=${row.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 hover:bg-amber-100"
          >
            {t("admin.credits.pendingCount", { count: row.pending_requests })}
          </Link>
        ),
    },
  ];

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
        activeCount={[plan].filter(Boolean).length}
        resultCount={total ?? undefined}
        onClear={() => {
          setQ("");
          setPlan("");
        }}
        columns={2}
        search={
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
        }
      >
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
          <DataTable
            label={t("admin.credits.title")}
            rows={users}
            rowKey={(row) => row.id}
            rowHref={(row) => `/admin/users/${row.id}`}
            rowClassName="hover:bg-gray-50"
            sort={{ sort, dir, onSort: toggleSort, setSort }}
            columns={columns}
          />
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
        </>
      )}
    </div>
  );
}

export default AdminCreditsPage;
