import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarClock, MapPin, Search, SearchX, ShoppingBasket, Tag } from "lucide-react";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../components/product/FilterBar.js";
import SortSelect, { MARKETPLACE_SORT_OPTIONS, ResultsBar, type MarketplaceSort } from "../components/product/SortSelect.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import { inputStyle } from "../components/form/FormField.js";
import CitySelect from "../components/form/CitySelect.js";
import RadiusSelect from "../components/product/RadiusSelect.js";
import OutsideRadiusHint from "../components/product/OutsideRadiusHint.js";
import LoadMore from "../components/LoadMore.js";
import StoreLogo from "../components/store/StoreLogo.js";
import ChainLabel from "../components/store/ChainLabel.js";
import StoreProductCard from "../components/store/StoreProductCard.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { useAddToCart } from "../hooks/useAddToCart.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import { DEFAULT_RADIUS, formatCityDistance, nextRadius, widenLabel, type Radius } from "../utils/radius.js";
import type { SearchStore } from "../types/index.js";
import StorePausedNotice from "../components/store/StorePausedNotice.js";

// Search ("Pretraga", restaurants): the marketplace grouped by store, since an order comes from one
// store. Each group has the store's logo (or a generic store image), name, city and a link to its
// store page, then its first matching products with + and the quantity stepper. Filters: name,
// category, expiring (today, tomorrow, 3 days), city and the nearby radius; sorting.
function SearchPage() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [expiryWithinDays, setExpiryWithinDays] = useState("");
  const [cityId, setCityId] = useState("");
  const [radius, setRadius] = useState<Radius>(DEFAULT_RADIUS);
  const [sort, setSort] = useState<MarketplaceSort>("newest");
  const cartActions = useAddToCart();
  const categories = t("categories", { returnObjects: true }) as Record<string, string>;

  // Paged by store; any filter or sort change starts again from the first page.
  const query = { name, category, expiryWithinDays, city_id: cityId, radius, sort };
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, JSON.stringify(query));
  const { data: stores, total, meta, loading, fetching, error } = useFetch<SearchStore>("/products/by-store", "stores", {
    ...query,
    limit,
  });

  const clearFilters = () => {
    setName("");
    setCategory("");
    setExpiryWithinDays("");
    setCityId("");
    setRadius(DEFAULT_RADIUS);
  };

  if (loading) return <LoadingSpinner />;

  const storeCount = total ?? stores.length;
  const hasOtherFilters = Boolean(name || category || expiryWithinDays || cityId);
  const hasActiveFilters = hasOtherFilters || radius !== DEFAULT_RADIUS;
  // A chosen city is shown whatever the radius, so the radius only limits a search without one.
  const radiusApplies = radius !== "all" && !cityId;
  const outsideRadiusCount = Number(meta?.outside_radius_count ?? 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <ProductPageHeader title={t("search.title")} subtitle={t("search.subtitle")} icon={Search} />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        activeCount={[category, expiryWithinDays, cityId, radius !== DEFAULT_RADIUS].filter(Boolean).length}
        resultCount={total ?? undefined}
        onClear={clearFilters}
        columns={5}
        search={
          <FilterField icon={Search}>
            <input
              type="text"
              placeholder={t("filters.searchByName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputStyle}
            />
          </FilterField>
        }
      >
        <FilterField icon={Tag}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("product.category")} className={inputStyle}>
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
            aria-label={t("filters.expiryDate")}
            className={inputStyle}
          >
            <option value="">{t("filters.expiryDate")}</option>
            <option value="0">{t("filters.today")}</option>
            <option value="1">{t("filters.tomorrow")}</option>
            <option value="3">{t("filters.within3Days")}</option>
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
        <RadiusSelect value={radius} onChange={setRadius} />
      </FilterBar>

      <ResultsBar count={t("search.storeCount", { count: storeCount })}>
        <SortSelect value={sort} onChange={setSort} options={MARKETPLACE_SORT_OPTIONS} />
      </ResultsBar>

      {error && stores.length === 0 ? (
        <LoadErrorState />
      ) : stores.length === 0 ? (
        radiusApplies ? (
          <EmptyState
            icon={hasOtherFilters ? SearchX : ShoppingBasket}
            title={t(hasOtherFilters ? "myProducts.noResultsTitle" : "product.noAvailableProductsTitle")}
            subtitle={t("radius.emptyOffers", { radius })}
            secondaryAction={{ label: widenLabel(t, radius), onClick: () => setRadius(nextRadius(radius)) }}
          />
        ) : hasActiveFilters ? (
          <EmptyState icon={SearchX} title={t("myProducts.noResultsTitle")} subtitle={t("myProducts.noResultsSubtitle")} />
        ) : (
          <EmptyState
            icon={ShoppingBasket}
            title={t("product.noAvailableProductsTitle")}
            subtitle={t("product.noAvailableProductsSubtitle")}
          />
        )
      ) : (
        <div className="space-y-6">
          {stores.map((store) => (
            <section
              key={store.id}
              data-testid="search-store"
              aria-labelledby={`search-store-${store.id}`}
              className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm sm:p-5"
            >
              <header className="flex items-center gap-3">
                <StoreLogo logoUrl={store.logo_url} className="h-12 w-12 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <h2 id={`search-store-${store.id}`} className="truncate text-base font-bold text-neutral-900">
                    <Link to={`/stores/${store.id}`} className="hover:text-brand-900">
                      {store.business_name}
                    </Link>
                  </h2>
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-neutral-500">
                    {store.city && <span>{formatCityDistance(t, store.city, store.distance_km)}</span>}
                    <ChainLabel company={store.company_name} className="px-1.5" />
                    <StorePausedNotice pause={store} variant="badge" />
                  </p>
                </div>
                <Link
                  to={`/stores/${store.id}`}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-brand-800 hover:bg-brand-50 sm:min-h-0 sm:py-1.5"
                >
                  {t("search.seeAll", { count: store.match_count })}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </header>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
                {store.products.map((product) => (
                  <StoreProductCard
                    key={product.id}
                    product={product}
                    inCart={cartActions.quantityOf(product.id)}
                    busy={cartActions.busyId === product.id}
                    onSetQuantity={(quantity) => cartActions.setQuantity(product, quantity)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <LoadMore shown={stores.length} total={storeCount} fetching={fetching} onLoadMore={loadMore} />

      {stores.length > 0 && radiusApplies && (
        <OutsideRadiusHint count={outsideRadiusCount} radius={radius} kind="offers" onWiden={setRadius} />
      )}

      {cartActions.confirmDialog}
    </div>
  );
}

export default SearchPage;
