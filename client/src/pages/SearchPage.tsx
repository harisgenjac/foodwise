import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, ChevronDown, CloudOff, MapPin, Navigation, Search, SearchX, ShoppingBasket } from "lucide-react";
import LoadingSpinner from "../components/LoadingSpinner.js";
import LoadMore from "../components/LoadMore.js";
import EmptyCard from "../components/common/EmptyCard.js";
import CitySelect from "../components/form/CitySelect.js";
import FilterBar, { type ActiveFilter } from "../components/filters/FilterBar.js";
import FilterDrawer, { FilterField, FilterPills } from "../components/filters/FilterDrawer.js";
import { MARKETPLACE_SORT_OPTIONS, type MarketplaceSort } from "../components/product/SortSelect.js";
import SearchStoreSection from "../components/search/SearchStoreSection.js";
import StoreCartBar from "../components/storePage/StoreCartBar.js";
import { useAuth } from "../context/AuthContext.js";
import { useCities } from "../hooks/useCities.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { useAddToCart } from "../hooks/useAddToCart.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import { DEFAULT_RADIUS, RADIUS_OPTIONS, nextRadius, widenLabel, type Radius } from "../utils/radius.js";
import type { SearchStore } from "../types/index.js";

const DRAWER_ID = "search-filters";

// The expiry filter (`expiryWithinDays`): any time, today, by tomorrow, within 3 days.
const EXPIRY_OPTIONS = ["", "0", "1", "3"] as const;
type Expiry = (typeof EXPIRY_OPTIONS)[number];
const EXPIRY_PILL: Record<Expiry, string> = { "": "search.expiryAny", "0": "search.expiryToday", "1": "search.expiryTomorrow", "3": "search.expiry3Days" };
const EXPIRY_CHIP: Record<Exclude<Expiry, "">, string> = { "0": "search.expiresToday", "1": "search.expiresTomorrow", "3": "search.expires3Days" };

const selectClass =
  "h-12 w-full cursor-pointer appearance-none rounded-xl border border-neutral-200 bg-white pr-10 pl-11 text-base text-neutral-900 outline-none focus:border-brand-800 focus:ring-[3px] focus:ring-brand-100 sm:text-[15px]";

// Search ("Pretraga", restaurants; design/search/search.html and search-filters.html): the
// marketplace grouped by store, since an order comes from one store. The FilterBar (product name,
// "Filteri" opening the FilterDrawer with category, expiry, city and distance, "Očisti", the active
// filter chips), the sort, one card per store with every matching offer (a slider with more than
// four; "+" and the stepper; grayscale and no "+" while the store takes no orders), "Prikaži još" by
// 12 stores, "Još N ponuda je dalje od 10 km." with the next radius, and the store page's cart bar.
// Every filter applies as it changes.
function SearchPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { cities } = useCities();
  // ?q= from the header's search field fills the name filter, on load and on every new search.
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [name, setName] = useState(q);
  const [appliedQ, setAppliedQ] = useState(q);
  if (q !== appliedQ) {
    setAppliedQ(q);
    setName(q);
  }
  const [category, setCategory] = useState("");
  const [expiry, setExpiry] = useState<Expiry>("");
  const [cityId, setCityId] = useState("");
  const [radius, setRadius] = useState<Radius>(DEFAULT_RADIUS);
  const [sort, setSort] = useState<MarketplaceSort>("newest");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const cart = useAddToCart();
  const categories = t("categories", { returnObjects: true }) as Record<string, string>;

  // Paged by store; any filter or sort change starts again from the first page.
  const query = { name, category, expiryWithinDays: expiry, city_id: cityId, radius, sort };
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, JSON.stringify(query));
  const { data: stores, total, meta, loading, fetching, error } = useFetch<SearchStore>("/products/by-store", "stores", {
    ...query,
    limit,
  });

  // A radius around the restaurant means nothing in another city: choosing one shows all of it.
  const changeCity = (id: string) => {
    setCityId(id);
    if (id && Number(id) !== user?.city_id) setRadius("all");
  };

  // Removes the search and every filter, the default 10 km too.
  const clearFilters = () => {
    setName("");
    setCategory("");
    setExpiry("");
    setCityId("");
    setRadius("all");
  };

  const radiusLabel = (value: Radius) => (value === "all" ? t("listFilters.noLimit") : t("radius.upTo", { km: value }));
  const removeLabel = (filter: string) => t("listFilters.remove", { filter });

  const activeFilters: ActiveFilter[] = [];
  if (category) {
    activeFilters.push({
      key: "category",
      label: categories[category] ?? category,
      removeLabel: removeLabel(t("search.category")),
      onRemove: () => setCategory(""),
    });
  }
  if (expiry) {
    activeFilters.push({
      key: "expiry",
      label: t(EXPIRY_CHIP[expiry]),
      removeLabel: removeLabel(t("search.expiry")),
      onRemove: () => setExpiry(""),
    });
  }
  if (cityId) {
    activeFilters.push({
      key: "city",
      label: cities.find((city) => String(city.id) === cityId)?.name ?? "",
      removeLabel: removeLabel(t("listFilters.city")),
      onRemove: () => setCityId(""),
    });
  }
  if (radius !== "all") {
    activeFilters.push({
      key: "radius",
      label: radiusLabel(radius),
      removeLabel: removeLabel(t("radius.label")),
      onRemove: () => setRadius("all"),
    });
  }
  const canClear = name.trim() !== "" || activeFilters.length > 0;

  if (loading) return <LoadingSpinner />;

  const storeCount = total ?? stores.length;
  // The radius only limits a search without a chosen city, around a restaurant that has one.
  const radiusApplies = radius !== "all" && !cityId && user?.city_id != null;
  const outsideCount = Number(meta?.outside_radius_count ?? 0);
  const hasOtherFilters = name.trim() !== "" || category !== "" || expiry !== "" || cityId !== "";

  const renderEmpty = () => {
    if (radiusApplies) {
      return (
        <EmptyCard
          testId="search-empty"
          icon={hasOtherFilters ? SearchX : ShoppingBasket}
          title={t(hasOtherFilters ? "search.noResultsTitle" : "product.noAvailableProductsTitle")}
          text={t("radius.emptyOffers", { radius })}
          action={{ label: widenLabel(t, radius), onClick: () => setRadius(nextRadius(radius)) }}
        />
      );
    }
    if (hasOtherFilters) {
      return (
        <EmptyCard
          testId="search-empty"
          icon={SearchX}
          title={t("search.noResultsTitle")}
          text={t("search.noResultsText")}
          action={{ label: t("filters.clear"), onClick: clearFilters }}
        />
      );
    }
    return (
      <EmptyCard
        testId="search-empty"
        icon={ShoppingBasket}
        title={t("product.noAvailableProductsTitle")}
        text={t("product.noAvailableProductsSubtitle")}
      />
    );
  };

  return (
    <div className="mx-auto flex max-w-[1136px] flex-col gap-6 pb-10 font-jakarta text-neutral-900">
      <div className="flex items-center gap-4">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
          <Search className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">{t("search.title")}</h1>
          <p className="mt-1 text-[15px] text-neutral-600">{t("search.subtitle")}</p>
        </div>
      </div>

      <FilterBar
        search={name}
        onSearchChange={setName}
        searchPlaceholder={t("search.searchPlaceholder")}
        activeFilters={activeFilters}
        onOpenFilters={() => setDrawerOpen(true)}
        filtersOpen={drawerOpen}
        drawerId={DRAWER_ID}
        onClear={clearFilters}
        canClear={canClear}
      />

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <label htmlFor="search-sort" className="text-sm font-semibold text-neutral-600">
          {t("filters.sortBy")}
        </label>
        <span className="relative block w-full max-w-[230px] min-w-0 flex-1 sm:flex-none">
          <ArrowUpDown className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-500" aria-hidden="true" />
          <select
            id="search-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as MarketplaceSort)}
            className={`${selectClass} font-semibold`}
          >
            {MARKETPLACE_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-600" aria-hidden="true" />
        </span>
      </div>

      {error && stores.length === 0 ? (
        <EmptyCard testId="search-error" icon={CloudOff} title={t("common.loadErrorTitle")} text={t("common.loadErrorSubtitle")} />
      ) : stores.length === 0 ? (
        renderEmpty()
      ) : (
        <div className="flex flex-col gap-6">
          {stores.map((store) => (
            <SearchStoreSection key={store.id} store={store} cart={cart} />
          ))}
        </div>
      )}

      <LoadMore shown={stores.length} total={storeCount} fetching={fetching} onLoadMore={loadMore} />

      {stores.length > 0 && radiusApplies && outsideCount > 0 && (
        <div
          data-testid="more-offers"
          className="flex flex-wrap items-center justify-center gap-4 rounded-[20px] border border-brand-100 bg-brand-50 px-5 py-4"
        >
          <span className="flex items-center gap-2 text-[15px] text-neutral-900">
            <Navigation className="h-[18px] w-[18px] shrink-0 text-brand-800" aria-hidden="true" />
            {t("radius.moreOffers", { count: outsideCount, radius })}
          </span>
          <button
            type="button"
            onClick={() => setRadius(nextRadius(radius))}
            className="h-11 cursor-pointer rounded-full bg-brand-800 px-5 text-sm font-bold text-white hover:bg-brand-900 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300"
          >
            {widenLabel(t, radius)}
          </button>
        </div>
      )}

      {drawerOpen && (
        <FilterDrawer id={DRAWER_ID} onClose={() => setDrawerOpen(false)} onClear={clearFilters} canClear={canClear}>
          <FilterPills
            label={t("search.category")}
            options={[
              { value: "", label: t("search.allCategories") },
              ...Object.entries(categories).map(([value, label]) => ({ value, label })),
            ]}
            value={category}
            onChange={setCategory}
          />
          <FilterPills
            label={t("search.expiry")}
            options={EXPIRY_OPTIONS.map((value) => ({ value, label: t(EXPIRY_PILL[value]) }))}
            value={expiry}
            onChange={setExpiry}
          />
          <FilterField label={t("listFilters.city")} htmlFor="search-filter-city">
            <span className="relative block">
              <MapPin className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-500" aria-hidden="true" />
              <CitySelect
                id="search-filter-city"
                value={cityId}
                onChange={changeCity}
                emptyLabel={t("listFilters.allCities")}
                className={selectClass}
              />
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-600" aria-hidden="true" />
            </span>
          </FilterField>
          <FilterPills
            label={t("radius.label")}
            options={RADIUS_OPTIONS.map((value) => ({ value, label: radiusLabel(value) }))}
            value={radius}
            onChange={setRadius}
          />
        </FilterDrawer>
      )}

      {/* The page's last element, so at the end of the page it stops above the footer. */}
      <StoreCartBar />
      {cart.confirmDialog}
    </div>
  );
}

export default SearchPage;
