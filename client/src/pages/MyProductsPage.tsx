import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
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
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import Modal from "../components/product/Modal.js";
import DonateProductModal from "../components/donation/DonateProductModal.js";
import { inputStyle } from "../components/form/FormField.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import type { Product } from "../types/index.js";

function MyProductsPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("Available");
  const [category, setCategory] = useState("");
  const [expiryWithinDays, setExpiryWithinDays] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [donatingProduct, setDonatingProduct] = useState<Product | null>(null);
  const { t } = useTranslation();
  const categories = t("categories", { returnObjects: true }) as Record<
    string,
    string
  >;
  const productStatuses = t("productStatus", { returnObjects: true }) as Record<
    string,
    string
  >;
  // 12 at a time; a filter change starts again from the first page, a reload keeps the limit.
  const filters = { name, status, category, expiryWithinDays };
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, JSON.stringify(filters));
  const {
    data: productsList,
    total,
    error,
    loading,
    fetching,
    refetch,
  } = useFetch<Product>("/products/mine", "products", { ...filters, limit });

  const handleDelete = async (productId: number) => {
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
    }
  };

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
        count={t("myProducts.productsCount", { count: total ?? productsList.length })}
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
        <Modal onClose={() => setSelectedProduct(null)}>
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="text-lg font-bold text-gray-900">
              {t("myProducts.deleteConfirmation")}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {t("myProducts.deleteConfirmationText", { name: selectedProduct.name })}
            </p>
          </div>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedProduct(null)}
              className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              {t("myProducts.cancelButton")}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(selectedProduct.id)}
              className="flex-1 cursor-pointer rounded-xl bg-red-600 py-2.5 font-semibold text-white transition-colors hover:bg-red-700"
            >
              {t("myProducts.confirmDeleteButton")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default MyProductsPage;
