import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CalendarPlus,
  Search,
  SearchX,
  ShoppingBasket,
  Tag,
} from "lucide-react";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import DashboardProductCard from "../components/dashboard/DashboardProductCard.jsx";
import ProductPageHeader from "../components/product/ProductPageHeader.jsx";
import FilterBar, { FilterField } from "../components/product/FilterBar.jsx";
import EmptyState from "../components/product/EmptyState.jsx";
import ReserveProductModal from "../components/product/ReserveProductModal.jsx";
import { inputStyle } from "../components/form/FormField.jsx";
import { useFetch } from "../hooks/useFetch.js";
import type { Product } from "../types/index.js";

function BrowseProductsPage() {
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [name, setName] = useState("");
  const [expiryWithinDays, setExpiryWithinDays] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { t } = useTranslation();
  const categories = t("categories", { returnObjects: true }) as Record<
    string,
    string
  >;
  const {
    data: productsList,
    loading,
    refetch,
  } = useFetch<Product>("/products", "products", {
    category,
    maxPrice,
    name,
    expiryWithinDays,
  });

  const clearFilters = () => {
    setName("");
    setCategory("");
    setMaxPrice("");
    setExpiryWithinDays("");
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const visibleProducts = productsList.filter(
    (p) => parseFloat(p.available_quantity || "0") > 0,
  );
  const hasActiveFilters = Boolean(name || category || maxPrice || expiryWithinDays);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <ProductPageHeader
        title={t("product.browseTitle")}
        subtitle={t("product.browseSubtitle")}
        icon={ShoppingBasket}
        count={t("product.offersCount", { count: visibleProducts.length })}
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
        <FilterField icon={Banknote}>
          <input
            type="number"
            min="0"
            placeholder={t("filters.maxPrice")}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={CalendarClock}>
          <select
            value={expiryWithinDays}
            onChange={(e) => setExpiryWithinDays(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("filters.expiryDate")}</option>
            <option value="1">{t("filters.today")}</option>
            <option value="2">{t("filters.tomorrow")}</option>
            <option value="3">{t("filters.within3Days")}</option>
            <option value="7">{t("filters.within7Days")}</option>
          </select>
        </FilterField>
      </FilterBar>

      {visibleProducts.length === 0 ? (
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
