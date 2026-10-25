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

const ACTION_STYLES: Record<AdminAction["action"], string> = {
  CREATE_USER: "bg-green-50 text-green-700",
  RESET_PASSWORD: "bg-blue-50 text-blue-700",
  BLOCK_USER: "bg-red-50 text-red-600",
  UNBLOCK_USER: "bg-green-50 text-green-700",
  REMOVE_PRODUCT: "bg-red-50 text-red-600",
  REMOVE_DONATION: "bg-red-50 text-red-600",
  CANCEL_RESERVATION: "bg-amber-50 text-amber-700",
  UPDATE_PROFILE: "bg-blue-50 text-blue-700",
  CREATE_ANNOUNCEMENT: "bg-blue-50 text-blue-700",
  END_ANNOUNCEMENT: "bg-gray-100 text-gray-700",
  APPROVE_CREDIT_REQUEST: "bg-green-50 text-green-700",
  REJECT_CREDIT_REQUEST: "bg-red-50 text-red-600",
  ADJUST_CREDITS: "bg-amber-50 text-amber-700",
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
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("admin.actions.columnAction")}</th>
                  <th className="px-4 py-3">{t("admin.actions.columnTarget")}</th>
                  <th className="hidden px-4 py-3 lg:table-cell">{t("admin.actions.columnReason")}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t("admin.actions.columnAdmin")}</th>
                  <th className="px-4 py-3">{t("admin.actions.columnTime")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {actions.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${ACTION_STYLES[row.action]}`}>
                        {actionTypes[row.action] ?? row.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.announcement_title && <p className="font-medium text-gray-900">{row.announcement_title}</p>}
                      {(row.product_name || row.donation_name) && (
                        <p className="font-medium text-gray-900">
                          {row.product_name || row.donation_name}
                          {row.target_reservation_id && (
                            <span className="font-normal text-gray-500"> · #{row.target_reservation_id}</span>
                          )}
                        </p>
                      )}
                      {row.target_user_id ? (
                        <Link to={`/admin/users/${row.target_user_id}`} className="text-gray-600 hover:text-orange-600">
                          {row.target_business_name || row.target_email}
                        </Link>
                      ) : (
                        !row.announcement_title && <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="hidden max-w-xs px-4 py-3 text-gray-600 lg:table-cell">{row.reason || "—"}</td>
                    <td className="hidden px-4 py-3 text-gray-600 md:table-cell">{row.admin_email}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">{formatDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
        </>
      )}
    </div>
  );
}

export default AdminActionsPage;
