import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CalendarClock,
  CircleDot,
  HandHeart,
  Package,
  PackagePlus,
  Pencil,
  Search,
  SearchX,
  Tag,
  Trash2,
} from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import DashboardProductCard from "../components/dashboard/DashboardProductCard.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../components/product/FilterBar.js";
import SortSelect, { ResultsBar } from "../components/product/SortSelect.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import ConfirmModal from "../components/common/ConfirmModal.js";
import DonateProductModal from "../components/donation/DonateProductModal.js";
import { inputStyle } from "../components/form/FormField.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import type { Product } from "../types/index.js";

// The `GET /products/mine` sorts; the server keeps Available products first under each of them.
const SORT_OPTIONS = [
  { value: "newest", label: "filters.sortNewest" },
  { value: "expiry", label: "filters.sortExpiry" },
  { value: "price_asc", label: "filters.sortPriceAsc" },
  { value: "price_desc", label: "filters.sortPriceDesc" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

function MyProductsPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("Available");
  const [category, setCategory] = useState("");
  const [expiryWithinDays, setExpiryWithinDays] = useState("");
  const [sort, setSort] = useState<SortValue>("newest");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [donatingProduct, setDonatingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { t } = useTranslation();
  const categories = t("categories", { returnObjects: true }) as Record<
    string,
    string
  >;
  const productStatuses = t("productStatus", { returnObjects: true }) as Record<
    string,
    string
  >;
  // 12 at a time; a filter or sort change starts again from the first page, a reload keeps the limit.
  const filters = { name, status, category, expiryWithinDays };
  const query = { ...filters, sort };
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, JSON.stringify(query));
  const {
    data: productsList,
    total,
    error,
    loading,
    fetching,
    refetch,
  } = useFetch<Product>("/products/mine", "products", { ...query, limit });

  const handleDelete = async (productId: number) => {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/products/${productId}`);
      setSelectedProduct(null);
      refetch();
      toast.success(t("myProducts.deleteSuccess"));
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("myProducts.deleteError"));
    } finally {
      setDeleting(false);
    }
  };

  // The sort is not a filter, so it stays.
  const clearFilters = () => {
    setName("");
    setCategory("");
    setStatus("Available");
    setExpiryWithinDays("");
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters = Boolean(
    name || category || expiryWithinDays || status !== "Available",
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <ProductPageHeader
        title={t("myProducts.title")}
        subtitle={t("myProducts.subtitle")}
        icon={Package}
        action={{ to: "/add-product", label: t("myProducts.addProductButton"), icon: PackagePlus }}
      />

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters}>
        <FilterField icon={Search}>
          <input
            type="text"
            placeholder={t("filters.searchByName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={Tag}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("filters.allCategories")}</option>
            {Object.entries(categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField icon={CircleDot}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("filters.selectStatus")}</option>
            <option value="Available">{productStatuses.Available}</option>
            <option value="Sold">{productStatuses.Sold}</option>
            <option value="Expired">{productStatuses.Expired}</option>
          </select>
        </FilterField>
        <FilterField icon={CalendarClock}>
          <select
            value={expiryWithinDays}
            onChange={(e) => setExpiryWithinDays(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("filters.expiryDate")}</option>
            <option value="0">{t("filters.today")}</option>
            <option value="1">{t("filters.tomorrow")}</option>
            <option value="3">{t("filters.within3Days")}</option>
            <option value="7">{t("filters.within7Days")}</option>
          </select>
        </FilterField>
      </FilterBar>

      <ResultsBar count={t("myProducts.productsCount", { count: total ?? productsList.length })}>
        <SortSelect value={sort} onChange={setSort} options={SORT_OPTIONS} />
      </ResultsBar>

      {error && productsList.length === 0 ? (
        <LoadErrorState />
      ) : productsList.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={SearchX}
            title={t("myProducts.noResultsTitle")}
            subtitle={t("myProducts.noResultsSubtitle")}
          />
        ) : (
          <EmptyState
            icon={Package}
            title={t("myProducts.noProductsTitle")}
            subtitle={t("myProducts.noProductsSubtitle")}
            action={{ to: "/add-product", label: t("myProducts.addProductButton") }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {productsList.map((product) => (
            <DashboardProductCard
              key={product.id}
              product={product}
              actions={
                <>
                  <Link
                    to={`/products/${product.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
                  >
                    {t("dashboard.detailsButton")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to={`/edit-product/${product.id}`}
                    title={t("myProducts.editButton")}
                    aria-label={t("myProducts.editButton")}
                    className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-3 text-gray-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  {product.status === "Available" && (
                    <button
                      type="button"
                      onClick={() => setDonatingProduct(product)}
                      title={t("donations.fromProduct.button")}
                      aria-label={t("donations.fromProduct.button")}
                      className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-gray-200 px-3 text-gray-600 transition-colors hover:border-green-200 hover:bg-green-50 hover:text-green-700"
                    >
                      <HandHeart className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(product)}
                    title={t("myProducts.deleteButton")}
                    aria-label={t("myProducts.deleteButton")}
                    className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-gray-200 px-3 text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      <LoadMore
        shown={productsList.length}
        total={total ?? productsList.length}
        fetching={fetching}
        onLoadMore={loadMore}
      />

      {donatingProduct && (
        <DonateProductModal
          product={donatingProduct}
          onClose={() => setDonatingProduct(null)}
          onDonated={refetch}
        />
      )}

      {selectedProduct && (
        <ConfirmModal
          variant="danger"
          title={t("myProducts.deleteConfirmation")}
          message={t("myProducts.deleteConfirmationText", { name: selectedProduct.name })}
          confirmLabel={t("myProducts.confirmDeleteButton")}
          cancelLabel={t("myProducts.cancelButton")}
          busy={deleting}
          onConfirm={() => handleDelete(selectedProduct.id)}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}

export default MyProductsPage;
