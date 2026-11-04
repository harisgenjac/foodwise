import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Search, ToggleLeft } from "lucide-react";
import { useFetch } from "../../hooks/useFetch.js";
import { useAdminPage, useKeepPageInRange } from "../../hooks/useAdminPage.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Pagination from "../../components/admin/Pagination.js";
import { ADMIN_PAGE_SIZE, formatDateTime } from "../../utils/admin.js";
import type { AdminCompanyListItem } from "../../types/index.js";
import DataTable, { type DataColumn } from "../../components/common/DataTable.js";

// Store chains: each company has a headquarters login and (from the next step) its branches.
function AdminCompaniesPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [blocked, setBlocked] = useState("");
  const { page, offset, setPage } = useAdminPage();

  const { data: companies, total, loading, error } = useFetch<AdminCompanyListItem>(
    "/admin/companies",
    "companies",
    { q, blocked, limit: ADMIN_PAGE_SIZE, offset },
  );
  useKeepPageInRange(page, total, setPage);

  const hasActiveFilters = Boolean(q || blocked);
  // Any filter change goes back to the first page.
  const filter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };
  const clearFilters = () => {
    setQ("");
    setBlocked("");
    setPage(1);
  };
  const newCompany = { to: "/admin/companies/new", label: t("admin.companies.newCompany") };

  // Phone cards: the company and its headquarters email with the status, the number of branches and
  // the creation date; the card opens the company.
  const columns: DataColumn<AdminCompanyListItem>[] = [
    {
      id: "company",
      header: t("admin.companies.columnCompany"),
      card: "title",
      cell: (company) => (
        <>
          <p className="font-medium text-gray-900">{company.name}</p>
          <p className="text-xs text-gray-500">{company.hq_email ?? "—"}</p>
        </>
      ),
    },
    {
      id: "branches",
      header: t("admin.companies.columnBranches"),
      cellClassName: "text-gray-600",
      cell: (company) => company.branch_count,
    },
    {
      id: "status",
      header: t("admin.companies.columnStatus"),
      card: "status",
      cell: (company) =>
        company.is_blocked ? (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">{t("admin.common.blocked")}</span>
        ) : (
          <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">{t("admin.common.active")}</span>
        ),
    },
    {
      id: "created",
      header: t("admin.companies.columnCreated"),
      className: "hidden md:table-cell",
      cellClassName: "text-gray-500",
      cell: (company) => formatDateTime(company.created_at),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("admin.companies.title")}
        subtitle={t("admin.companies.subtitle")}
        icon={Building2}
        count={total === null ? undefined : t("admin.companies.count", { count: total })}
        action={{ ...newCompany, icon: Building2 }}
      />

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters} columns={3}>
        <FilterField icon={Search}>
          <input
            type="text"
            value={q}
            onChange={(e) => filter(setQ)(e.target.value)}
            placeholder={t("admin.companies.search")}
            aria-label={t("admin.companies.search")}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={ToggleLeft}>
          <select
            value={blocked}
            onChange={(e) => filter(setBlocked)(e.target.value)}
            aria-label={t("admin.companies.columnStatus")}
            className={inputStyle}
          >
            <option value="">{t("admin.users.allStatuses")}</option>
            <option value="false">{t("admin.common.active")}</option>
            <option value="true">{t("admin.common.blocked")}</option>
          </select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <LoadErrorState />
      ) : companies.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={Building2}
            title={t("admin.companies.noResultsTitle")}
            subtitle={t("admin.companies.noResultsSubtitle")}
          />
        ) : (
          <EmptyState
            icon={Building2}
            title={t("admin.companies.emptyTitle")}
            subtitle={t("admin.companies.emptySubtitle")}
            action={newCompany}
          />
        )
      ) : (
        <>
          <DataTable
            label={t("admin.companies.title")}
            rows={companies}
            rowKey={(company) => company.id}
            rowHref={(company) => `/admin/companies/${company.id}`}
            rowClassName="hover:bg-orange-50/40"
            columns={columns}
          />
          <Pagination
            total={total ?? 0}
            limit={ADMIN_PAGE_SIZE}
            offset={offset}
            onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)}
          />
        </>
      )}
    </div>
  );
}

export default AdminCompaniesPage;
