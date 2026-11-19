import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, ListFilter } from "lucide-react";
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
import type { AdminAction } from "../../types/index.js";
import DataTable, { type DataColumn } from "../../components/common/DataTable.js";

const ACTION_STYLES: Record<AdminAction["action"], string> = {
  CREATE_USER: "bg-success-100 text-success-800",
  RESET_PASSWORD: "bg-info-50 text-info-700",
  BLOCK_USER: "bg-danger-50 text-danger-700",
  UNBLOCK_USER: "bg-success-100 text-success-800",
  REMOVE_PRODUCT: "bg-danger-50 text-danger-700",
  REMOVE_DONATION: "bg-danger-50 text-danger-700",
  CANCEL_ORDER: "bg-warning-50 text-warning-700",
  UPDATE_PROFILE: "bg-info-50 text-info-700",
  CREATE_ANNOUNCEMENT: "bg-info-50 text-info-700",
  END_ANNOUNCEMENT: "bg-neutral-100 text-neutral-700",
  APPROVE_CREDIT_REQUEST: "bg-success-100 text-success-800",
  REJECT_CREDIT_REQUEST: "bg-danger-50 text-danger-700",
  ADJUST_CREDITS: "bg-warning-50 text-warning-700",
  CREATE_COMPANY: "bg-success-100 text-success-800",
  UPDATE_COMPANY: "bg-info-50 text-info-700",
  BLOCK_COMPANY: "bg-danger-50 text-danger-700",
  UNBLOCK_COMPANY: "bg-success-100 text-success-800",
  DEACTIVATE_BRANCH: "bg-neutral-100 text-neutral-700",
  REACTIVATE_BRANCH: "bg-success-100 text-success-800",
  ATTACH_BRANCH: "bg-info-50 text-info-700",
  SEND_INVITATION: "bg-info-50 text-info-700",
  RESEND_INVITATION: "bg-info-50 text-info-700",
  SEND_PASSWORD_RESET_LINK: "bg-info-50 text-info-700",
};

function AdminActionsPage() {
  const { t } = useTranslation();
  const [action, setAction] = useState("");
  const { page, offset, setPage } = useAdminPage();

  const { data: actions, total, loading, error } = useFetch<AdminAction>("/admin/actions", "actions", {
    action,
    limit: ADMIN_PAGE_SIZE,
    offset,
  });
  useKeepPageInRange(page, total, setPage);

  const actionTypes = t("admin.actionTypes", { returnObjects: true }) as Record<string, string>;

  // Phone cards: what was affected and the action as the pill, the reason, the admin and the time.
  const columns: DataColumn<AdminAction>[] = [
    {
      id: "action",
      header: t("admin.actions.columnAction"),
      card: "status",
      cell: (row) => (
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${ACTION_STYLES[row.action]}`}>
          {actionTypes[row.action] ?? row.action}
        </span>
      ),
    },
    {
      id: "target",
      header: t("admin.actions.columnTarget"),
      card: "title",
      cell: (row) => (
        <>
          {row.announcement_title && <p className="font-medium text-neutral-900">{row.announcement_title}</p>}
          {(row.product_name || row.donation_name) && (
            <p className="font-medium text-neutral-900">{row.product_name || row.donation_name}</p>
          )}
          {row.target_company_id && (
            <Link to={`/admin/companies/${row.target_company_id}`} className="font-medium text-neutral-900 hover:text-brand-900">
              {row.company_name}
            </Link>
          )}
          {row.target_user_id ? (
            <Link to={`/admin/users/${row.target_user_id}`} className="text-neutral-600 hover:text-brand-900">
              {row.target_business_name || row.target_email}
            </Link>
          ) : (
            !row.announcement_title && !row.target_company_id && <span className="text-neutral-500">—</span>
          )}
        </>
      ),
    },
    {
      id: "reason",
      header: t("admin.actions.columnReason"),
      className: "hidden lg:table-cell",
      cellClassName: "max-w-xs text-neutral-600",
      cardStacked: true,
      cell: (row) => row.reason || "—",
      cardCell: (row) => row.reason,
    },
    {
      id: "admin",
      header: t("admin.actions.columnAdmin"),
      className: "hidden md:table-cell",
      cellClassName: "text-neutral-600",
      cell: (row) => row.admin_email,
    },
    {
      id: "time",
      header: t("admin.actions.columnTime"),
      cellClassName: "whitespace-nowrap text-neutral-500",
      cell: (row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("admin.actions.title")}
        subtitle={t("admin.actions.subtitle")}
        icon={ClipboardList}
        count={total === null ? undefined : t("admin.actions.count", { count: total })}
      />

      <FilterBar
        hasActiveFilters={Boolean(action)}
        onClear={() => {
          setAction("");
          setPage(1);
        }}
        columns={3}
      >
        <FilterField icon={ListFilter}>
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            aria-label={t("admin.actions.columnAction")}
            className={inputStyle}
          >
            <option value="">{t("admin.actions.allActions")}</option>
            {Object.entries(actionTypes).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <LoadErrorState />
      ) : actions.length === 0 ? (
        action ? (
          <EmptyState icon={ClipboardList} title={t("admin.actions.noResultsTitle")} subtitle={t("admin.actions.noResultsSubtitle")} />
        ) : (
          <EmptyState icon={ClipboardList} title={t("admin.actions.emptyTitle")} subtitle={t("admin.actions.emptySubtitle")} />
        )
      ) : (
        <>
          <DataTable
            label={t("admin.actions.title")}
            rows={actions}
            rowKey={(row) => row.id}
            rowClassName="align-top"
            columns={columns}
          />
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
        </>
      )}
    </div>
  );
}

export default AdminActionsPage;
