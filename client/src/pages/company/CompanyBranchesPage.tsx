import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Mail, MapPin, Package, Search, Store, ToggleLeft, Clock } from "lucide-react";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import CitySelect from "../../components/form/CitySelect.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import LoadMore from "../../components/LoadMore.js";
import { useFetch } from "../../hooks/useFetch.js";
import { usePagedLimit } from "../../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../../utils/pagination.js";
import { BRANCH_STATUSES, BRANCH_STATUS_STYLES } from "../../utils/branches.js";
import type { Branch } from "../../types/index.js";

// "Poslovnice": the headquarters' list of its branches, with a link to create a new one.
function CompanyBranchesPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [cityId, setCityId] = useState("");
  const [status, setStatus] = useState("");
  const filters = { q, city_id: cityId, status };
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, JSON.stringify(filters));
  const { data: branches, total, loading, fetching, error } = useFetch<Branch>("/company/branches", "branches", {
    ...filters,
    limit,
  });

  const hasActiveFilters = Boolean(q || cityId || status);
  const clearFilters = () => {
    setQ("");
    setCityId("");
    setStatus("");
  };
  const newBranch = { to: "/company/branches/new", label: t("company.branches.newBranch") };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("company.branches.title")}
        subtitle={t("company.branches.subtitle")}
        icon={Store}
        count={total === null ? undefined : t("company.branches.count", { count: total })}
        action={{ ...newBranch, icon: Store }}
      />

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters} columns={3}>
        <FilterField icon={Search}>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("company.branches.search")}
            aria-label={t("company.branches.search")}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={MapPin}>
          <CitySelect
            value={cityId}
            onChange={setCityId}
            emptyLabel={t("cities.all")}
            aria-label={t("cities.label")}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={ToggleLeft}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t("company.branches.statusFilter")}
            className={inputStyle}
          >
            <option value="">{t("company.branches.allStatuses")}</option>
            {BRANCH_STATUSES.map((code) => (
              <option key={code} value={code}>
                {t(`company.branchStatus.${code}`)}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <LoadErrorState />
      ) : branches.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={Store}
            title={t("company.branches.noResultsTitle")}
            subtitle={t("company.branches.noResultsSubtitle")}
          />
        ) : (
          <EmptyState
            icon={Store}
            title={t("company.branches.emptyTitle")}
            subtitle={t("company.branches.emptySubtitle")}
            action={newBranch}
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((branch) => (
              <Link
                key={branch.id}
                to={`/company/branches/${branch.id}`}
                className="group flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 text-lg font-bold text-gray-800">{branch.business_name}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${BRANCH_STATUS_STYLES[branch.status]}`}
                  >
                    {t(`company.branchStatus.${branch.status}`)}
                  </span>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="truncate">{[branch.address, branch.city].filter(Boolean).join(", ") || "—"}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="truncate">{branch.email}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" />
                    {t("company.branches.activeProducts", { count: branch.active_products })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {t("company.branches.pendingReservations", { count: branch.pending_reservations })}
                  </span>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-orange-600">
                  {t("company.branches.open")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
          <LoadMore shown={branches.length} total={total ?? branches.length} fetching={fetching} onLoadMore={loadMore} />
        </>
      )}
    </div>
  );
}

export default CompanyBranchesPage;
