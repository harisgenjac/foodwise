import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ArrowUpDown,
  CalendarClock,
  CalendarPlus,
  MapPin,
  Search,
  SearchX,
  ShoppingBasket,
  Tag,
} from "lucide-react";
import LoadingSpinner from "../components/LoadingSpinner.js";
import DashboardProductCard from "../components/dashboard/DashboardProductCard.js";
import ProductPageHeader, { CountPill } from "../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../components/product/FilterBar.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import ReserveProductModal from "../components/product/ReserveProductModal.js";
import { inputStyle } from "../components/form/FormField.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import type { Product } from "../types/index.js";

// The server's `sort` values with their labels. Prices are per unit, as the cards show.
const SORT_OPTIONS = [
  { value: "newest", label: "filters.sortNewest" },
  { value: "expiry", label: "filters.sortExpiry" },
  { value: "price_asc", label: "filters.sortPriceAsc" },
  { value: "price_desc", label: "filters.sortPriceDesc" },
  { value: "discount_desc", label: "filters.sortDiscountDesc" },
  { value: "discount_asc", label: "filters.sortDiscountAsc" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

function BrowseProductsPage() {
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [expiryWithinDays, setExpiryWithinDays] = useState("");
  const [sort, setSort] = useState<SortValue>("newest");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { t } = useTranslation();
  const categories = t("categories", { returnObjects: true }) as Record<
    string,
    string
  >;
  // The server leaves out fully reserved products and pages the rest; "Load more" raises the
  // limit, and any filter or sort change starts again from the first page.
  const filters = { category, name, city, expiryWithinDays };
  const query = { ...filters, sort };
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, JSON.stringify(query));
  const {
    data: visibleProducts,
    total,
    loading,
    fetching,
    error,
    refetch,
  } = useFetch<Product>("/products", "products", { ...query, limit });

  // The sort is not a filter, so it stays.
  const clearFilters = () => {
    setName("");
    setCity("");
    setCategory("");
    setExpiryWithinDays("");
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const totalCount = total ?? visibleProducts.length;
  const hasActiveFilters = Boolean(name || city || category || expiryWithinDays);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <ProductPageHeader
        title={t("product.browseTitle")}
        subtitle={t("product.browseSubtitle")}
        icon={ShoppingBasket}
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
        <FilterField icon={MapPin}>
          <input
            type="text"
            placeholder={t("filters.searchByCity")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputStyle}
          />
        </FilterField>
      </FilterBar>

      {/* Count on the left and sort on the right; stacked on phones. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CountPill>{t("product.offersCount", { count: totalCount })}</CountPill>
        <label className="flex items-center gap-2 text-sm text-gray-500">
          <span className="shrink-0">{t("filters.sortBy")}</span>
          <FilterField icon={ArrowUpDown}>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortValue)}
              className={`${inputStyle} sm:w-56`}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </FilterField>
        </label>
      </div>

      {error && visibleProducts.length === 0 ? (
        <LoadErrorState />
      ) : visibleProducts.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={SearchX}
            title={t("myProducts.noResultsTitle")}
            subtitle={t("myProducts.noResultsSubtitle")}
          />
        ) : (
          <EmptyState
            icon={ShoppingBasket}
            title={t("product.noAvailableProductsTitle")}
            subtitle={t("product.noAvailableProductsSubtitle")}
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product) => (
            <DashboardProductCard
              key={product.id}
              product={product}
              showStore
              actions={
                <>
                  <Link
                    to={`/products/${product.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100"
                  >
                    {t("dashboard.detailsButton")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(product)}
                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600"
                  >
                    <CalendarPlus className="h-4 w-4" />
                    {t("myProducts.reserveButton")}
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      <LoadMore shown={visibleProducts.length} total={totalCount} fetching={fetching} onLoadMore={loadMore} />

      {selectedProduct && (
        <ReserveProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onReserved={refetch}
        />
      )}
    </div>
  );
}

export default BrowseProductsPage;
