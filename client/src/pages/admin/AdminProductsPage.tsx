import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ListFilter, Package, Search, Trash2, X } from "lucide-react";
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
import ConfirmModal from "../../components/common/ConfirmModal.js";
import { PRODUCT_STATUS_STYLES } from "../../utils/productStatus.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { ADMIN_PAGE_SIZE } from "../../utils/admin.js";
import type { AdminProduct } from "../../types/index.js";

// Sortable columns (the server whitelist of GET /admin/products).
const SORT_KEYS = ["discounted_price", "expiry_date"];

function AdminProductsPage() {
  const { t } = useTranslation();
  // Set when coming from a user's page ("User's products").
  const [searchParams, setSearchParams] = useSearchParams();
  const storeId = searchParams.get("store_id") ?? "";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { page, offset, setPage } = useAdminPage();
  const { sort, dir, toggleSort, setSort } = useAdminSort(SORT_KEYS);
  const [selected, setSelected] = useState<AdminProduct | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: products, total, loading, error, refetch } = useFetch<AdminProduct>("/admin/products", "products", {
    q,
    status,
    store_id: storeId,
    sort,
    dir,
    limit: ADMIN_PAGE_SIZE,
    offset,
  });
  useKeepPageInRange(page, total, setPage);

  const statuses = t("productStatus", { returnObjects: true }) as Record<string, string>;
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const hasActiveFilters = Boolean(q || status);

  const removeProduct = async (reason: string) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api.delete(`/admin/products/${selected.id}`, { data: { reason } });
      toast.success(t("admin.products.removed"));
      setSelected(null);
      refetch();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("admin.common.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const removeButton = (product: AdminProduct, card: boolean) =>
    product.status !== "Removed" && (
      <button
        type="button"
        onClick={() => setSelected(product)}
        className={
          card
            ? "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
            : "inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        }
      >
        <Trash2 className="h-4 w-4" />
        {t("admin.common.remove")}
      </button>
    );
  // Phone cards: the product and quantity, its status, the store, the price and the expiry date, and
  // Remove as a full-width button.
  const columns: DataColumn<AdminProduct>[] = [
    {
      id: "product",
      header: t("admin.products.columnProduct"),
      card: "title",
      cell: (product) => (
        <>
          <p className="font-medium text-gray-900">{product.name}</p>
          <p className="text-xs text-gray-500">
            {parseFloat(product.quantity)} {units[product.unit] || product.unit}
          </p>
        </>
      ),
    },
    {
      id: "store",
      header: t("admin.products.columnStore"),
      cell: (product) => (
        <>
          <Link to={`/admin/users/${product.store_id}`} className="font-medium text-gray-900 hover:text-orange-600">
            {product.business_name || product.store_email}
          </Link>
          {product.store_is_blocked && <p className="text-xs font-semibold text-red-600">{t("admin.products.storeBlocked")}</p>}
        </>
      ),
    },
    {
      id: "price",
      header: t("admin.products.columnPrice"),
      sortKey: "discounted_price",
      className: "hidden md:table-cell",
      cell: (product) => (
        <>
          <span className="font-semibold text-green-700">{parseFloat(product.discounted_price).toFixed(2)} KM</span>
          <span className="ml-1 text-xs text-gray-400 line-through">{parseFloat(product.original_price).toFixed(2)}</span>
        </>
      ),
    },
    {
      id: "expiry",
      header: t("admin.products.columnExpiry"),
      sortKey: "expiry_date",
      className: "hidden md:table-cell",
      cellClassName: "text-gray-600",
      cell: (product) => formatDisplayDate(product.expiry_date),
    },
    {
      id: "status",
      header: t("admin.products.columnStatus"),
      card: "status",
      cell: (product) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PRODUCT_STATUS_STYLES[product.status]}`}>
          {statuses[product.status] || product.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      card: "actions",
      cellClassName: "text-right",
      cell: (product) => removeButton(product, false),
      cardCell: (product) => removeButton(product, true),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("admin.products.title")}
        subtitle={t("admin.products.subtitle")}
        icon={Package}
        count={total === null ? undefined : t("admin.products.count", { count: total })}
      />

      {storeId && (
        <p className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-2 text-sm text-orange-800">
          {t("admin.products.filteredByUser")}
          <button
            type="button"
            onClick={() => {
              setSearchParams({});
            }}
            className="inline-flex cursor-pointer items-center gap-1 font-medium hover:underline"
          >
            <X className="h-4 w-4" />
            {t("admin.products.showAll")}
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
              placeholder={t("admin.products.search")}
              aria-label={t("admin.products.search")}
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
            aria-label={t("admin.products.columnStatus")}
            className={inputStyle}
          >
            <option value="">{t("admin.products.allStatuses")}</option>
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
      ) : products.length === 0 ? (
        hasActiveFilters || storeId ? (
          <EmptyState icon={Package} title={t("admin.products.noResultsTitle")} subtitle={t("admin.products.noResultsSubtitle")} />
        ) : (
          <EmptyState icon={Package} title={t("admin.products.emptyTitle")} subtitle={t("admin.products.emptySubtitle")} />
        )
      ) : (
        <>
          <DataTable
            label={t("admin.products.title")}
            rows={products}
            rowKey={(product) => product.id}
            sort={{ sort, dir, onSort: toggleSort, setSort }}
            columns={columns}
          />
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
        </>
      )}

      {selected && (
        <ConfirmModal
          variant="danger"
          reason
          title={t("admin.products.removeTitle")}
          message={t("admin.products.removeText", { name: selected.name })}
          confirmLabel={t("admin.common.remove")}
          cancelLabel={t("admin.common.cancel")}
          busy={busy}
          onConfirm={removeProduct}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default AdminProductsPage;
