import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
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
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../components/product/FilterBar.js";
import SortSelect, {
  MARKETPLACE_SORT_OPTIONS,
  ResultsBar,
  type MarketplaceSort,
} from "../components/product/SortSelect.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import ReserveProductModal from "../components/product/ReserveProductModal.js";
import { inputStyle } from "../components/form/FormField.js";
import CitySelect from "../components/form/CitySelect.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import type { Product } from "../types/index.js";

function BrowseProductsPage() {
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [cityId, setCityId] = useState("");
  const [expiryWithinDays, setExpiryWithinDays] = useState("");
  const [sort, setSort] = useState<MarketplaceSort>("newest");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { t } = useTranslation();
  const categories = t("categories", { returnObjects: true }) as Record<
    string,
    string
  >;
  // The server leaves out fully reserved products and pages the rest; "Load more" raises the
  // limit, and any filter or sort change starts again from the first page.
  const filters = { category, name, city_id: cityId, expiryWithinDays };
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
    setCityId("");
    setCategory("");
    setExpiryWithinDays("");
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const totalCount = total ?? visibleProducts.length;
  const hasActiveFilters = Boolean(name || cityId || category || expiryWithinDays);

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
          <CitySelect
            value={cityId}
            onChange={setCityId}
            emptyLabel={t("cities.all")}
            aria-label={t("cities.label")}
            className={inputStyle}
          />
        </FilterField>
      </FilterBar>

      <ResultsBar count={t("product.offersCount", { count: totalCount })}>
        <SortSelect value={sort} onChange={setSort} options={MARKETPLACE_SORT_OPTIONS} />
      </ResultsBar>

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
