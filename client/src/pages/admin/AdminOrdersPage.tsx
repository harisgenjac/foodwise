import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Ban, ListFilter, ReceiptText, Search, X } from "lucide-react";
import api from "../../api/axios.js";
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
import AdminCancelOrderModal, { ADMIN_CANCELLABLE } from "../../components/admin/AdminCancelOrderModal.js";
import { ADMIN_PAGE_SIZE, formatDateTime } from "../../utils/admin.js";
import { formatMoney, formatOrderCode, itemsSummary, ORDER_STATUS_STYLES } from "../../utils/orders.js";
import type { AdminOrder } from "../../types/index.js";

// Sortable columns (the server whitelist of GET /admin/orders).
const SORT_KEYS = ["pickup_at"];

// Every order on the platform: search by product, business (name or email) or code, filter by
// status or by a user (from the user's page), and cancel an open order with a reason.
function AdminOrdersPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get("user_id") ?? "";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { page, offset, setPage } = useAdminPage();
  const { sort, dir, toggleSort, setSort } = useAdminSort(SORT_KEYS);
  const [selected, setSelected] = useState<AdminOrder | null>(null);

  const { data: orders, total, loading, error, refetch } = useFetch<AdminOrder>("/admin/orders", "orders", {
    q,
    status,
    user_id: userId,
    sort,
    dir,
    limit: ADMIN_PAGE_SIZE,
    offset,
  });
  useKeepPageInRange(page, total, setPage);

  const statuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;
  const hasActiveFilters = Boolean(q || status);

  const cancelButton = (order: AdminOrder, card: boolean) =>
    ADMIN_CANCELLABLE.includes(order.status) && (
      <button
        type="button"
        onClick={() => setSelected(order)}
        className={
          card
            ? "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
            : "inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        }
      >
        <Ban className="h-4 w-4" />
        {t("admin.orders.cancel")}
      </button>
    );

  // Phone cards: the code with the items and total, the status, both businesses and the pickup,
  // and Cancel as a full-width button.
  const columns: DataColumn<AdminOrder>[] = [
    {
      id: "order",
      header: t("admin.orders.columnOrder"),
      card: "title",
      cell: (order) => (
        <>
          <Link to={`/admin/orders/${order.id}`} className="font-semibold text-gray-900 hover:text-orange-600">
            {formatOrderCode(order.code)}
          </Link>
          <p className="max-w-xs truncate text-xs text-gray-500">{itemsSummary(order, t)}</p>
          <p className="text-xs font-medium text-gray-700">{formatMoney(order.total)}</p>
        </>
      ),
    },
    {
      id: "store",
      header: t("admin.orders.columnStore"),
      className: "hidden md:table-cell",
      cell: (order) => (
        <Link to={`/admin/users/${order.store_id}`} className="text-gray-700 hover:text-orange-600">
          {order.store_name || order.store_email}
        </Link>
      ),
    },
    {
      id: "restaurant",
      header: t("admin.orders.columnRestaurant"),
      className: "hidden md:table-cell",
      cell: (order) => (
        <Link to={`/admin/users/${order.restaurant_id}`} className="text-gray-700 hover:text-orange-600">
          {order.restaurant_name || order.restaurant_email}
        </Link>
      ),
    },
    {
      id: "pickup",
      header: t("admin.orders.columnPickup"),
      sortKey: "pickup_at",
      className: "hidden lg:table-cell",
      cellClassName: "whitespace-nowrap text-gray-600",
      cell: (order) => (
        <>
          {formatDateTime(order.pickup_at)}
          {order.is_overdue && (
            <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
              {t("admin.orders.late")}
            </span>
          )}
        </>
      ),
    },
    {
      id: "status",
      header: t("admin.orders.columnStatus"),
      card: "status",
      cell: (order) => (
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${ORDER_STATUS_STYLES[order.status]}`}>
          {statuses[order.status] || order.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      card: "actions",
      cellClassName: "text-right",
      cell: (order) => cancelButton(order, false),
      cardCell: (order) => cancelButton(order, true),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("admin.orders.title")}
        subtitle={t("admin.orders.subtitle")}
        icon={ReceiptText}
        count={total === null ? undefined : t("admin.orders.count", { count: total })}
      />

      {userId && (
        <p className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-2 text-sm text-orange-800">
          {t("admin.orders.filteredByUser")}
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="inline-flex cursor-pointer items-center gap-1 font-medium hover:underline"
          >
            <X className="h-4 w-4" />
            {t("admin.orders.showAll")}
          </button>
        </p>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        activeCount={[status].filter(Boolean).length}
        resultCount={total ?? undefined}
        onClear={() => {
          setQ("");
          setStatus("");
          setPage(1);
        }}
        columns={3}
        search={
          <FilterField icon={Search}>
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={t("admin.orders.search")}
              aria-label={t("admin.orders.search")}
              className={inputStyle}
            />
          </FilterField>
        }
      >
        <FilterField icon={ListFilter}>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label={t("admin.orders.columnStatus")}
            className={inputStyle}
          >
            <option value="">{t("admin.orders.allStatuses")}</option>
            {Object.entries(statuses).map(([code, label]) => (
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
      ) : orders.length === 0 ? (
        hasActiveFilters || userId ? (
          <EmptyState
            icon={ReceiptText}
            title={t("admin.orders.noResultsTitle")}
            subtitle={t("admin.orders.noResultsSubtitle")}
          />
        ) : (
          <EmptyState icon={ReceiptText} title={t("admin.orders.emptyTitle")} subtitle={t("admin.orders.emptySubtitle")} />
        )
      ) : (
        <>
          <DataTable
            label={t("admin.orders.title")}
            rows={orders}
            rowKey={(order) => order.id}
            sort={{ sort, dir, onSort: toggleSort, setSort }}
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

      {selected && (
        <AdminCancelOrderModal
          order={selected}
          storeName={selected.store_name || selected.store_email}
          onClose={() => setSelected(null)}
          onCancelled={() => {
            setSelected(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

export default AdminOrdersPage;
