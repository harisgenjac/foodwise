import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ListFilter, Package, Search, Trash2, X } from "lucide-react";
import api from "../../api/axios.js";
import { useFetch } from "../../hooks/useFetch.js";
import { useAdminPage, useKeepPageInRange } from "../../hooks/useAdminPage.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Pagination from "../../components/admin/Pagination.js";
import ConfirmModal from "../../components/common/ConfirmModal.js";
import { PRODUCT_STATUS_STYLES } from "../../utils/productStatus.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { ADMIN_PAGE_SIZE } from "../../utils/admin.js";
import type { AdminProduct } from "../../types/index.js";

function AdminProductsPage() {
  const { t } = useTranslation();
  // Set when coming from a user's page ("User's products").
  const [searchParams, setSearchParams] = useSearchParams();
  const storeId = searchParams.get("store_id") ?? "";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { page, offset, setPage } = useAdminPage();
  const [selected, setSelected] = useState<AdminProduct | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: products, total, loading, error, refetch } = useFetch<AdminProduct>("/admin/products", "products", {
    q,
    status,
    store_id: storeId,
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
        onClear={() => {
          setQ("");
          setStatus("");
          setPage(1);
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
            placeholder={t("admin.products.search")}
            aria-label={t("admin.products.search")}
            className={inputStyle}
          />
        </FilterField>
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
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("admin.products.columnProduct")}</th>
                  <th className="px-4 py-3">{t("admin.products.columnStore")}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t("admin.products.columnPrice")}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t("admin.products.columnExpiry")}</th>
                  <th className="px-4 py-3">{t("admin.products.columnStatus")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-500">
                        {parseFloat(product.quantity)} {units[product.unit] || product.unit}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${product.store_id}`} className="font-medium text-gray-900 hover:text-orange-600">
                        {product.business_name || product.store_email}
                      </Link>
                      {product.store_is_blocked && (
                        <p className="text-xs font-semibold text-red-600">{t("admin.products.storeBlocked")}</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="font-semibold text-green-700">{parseFloat(product.discounted_price).toFixed(2)} KM</span>
                      <span className="ml-1 text-xs text-gray-400 line-through">
                        {parseFloat(product.original_price).toFixed(2)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-600 md:table-cell">{formatDisplayDate(product.expiry_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PRODUCT_STATUS_STYLES[product.status]}`}>
                        {statuses[product.status] || product.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {product.status !== "Removed" && (
                        <button
                          type="button"
                          onClick={() => setSelected(product)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("admin.common.remove")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
