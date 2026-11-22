import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ChevronDown, HeartOff, MapPin, Navigation, SearchX, Store } from "lucide-react";
import api, { apiErrorMessage } from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import EmptyCard from "../components/common/EmptyCard.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import StoreCard from "../components/store/StoreCard.js";
import CitySelect from "../components/form/CitySelect.js";
import FilterBar, { type ActiveFilter } from "../components/filters/FilterBar.js";
import FilterDrawer, { FilterField, FilterPills } from "../components/filters/FilterDrawer.js";
import { useCities } from "../hooks/useCities.js";
import { DEFAULT_RADIUS, RADIUS_OPTIONS, nextRadius, widenLabel, type Radius } from "../utils/radius.js";
import type { Favorites, User } from "../types/index.js";

type View = "all" | "favorites";

const DRAWER_ID = "stores-filters";

// The store list for restaurants (/stores, design/stores/stores-list.html and stores-filters.html):
// the header with the All / Favourites tabs, the FilterBar (name search, "Filteri" opening the
// FilterDrawer with city and distance, "Očisti", the active filter chips), the store cards nearest
// first (the server's order: map pins, or cities without a pin), "Load more" by 12, and "Još N
// prodavnica je dalje od 10 km." with the next radius. Every filter applies as it changes.
function StoresPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { cities } = useCities();
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [cityId, setCityId] = useState("");
  const [radius, setRadius] = useState<Radius>(DEFAULT_RADIUS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const favoritesView = view === "favorites";

  // Favourites are filtered on the server; there the radius never applies (every favourite shows).
  const filters = {
    business_name: search,
    city_id: cityId,
    favorites: favoritesView ? "true" : "",
    radius,
  };
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, JSON.stringify(filters));
  const { data: stores, total, meta, loading, fetching, error, refetch } = useFetch<User>(
    "/users/stores",
    "stores",
    { ...filters, limit },
  );

  const fetchFavorites = async () => {
    try {
      const response = await api.get("/favorites");
      setFavoriteIds(response.data.favorites.map((favorite: Favorites) => favorite.id));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  // The heart flips at once and a toast confirms it; a failure puts it back and says why.
  const toggleFavorite = async (storeId: number, storeName: string) => {
    const wasFavorite = favoriteIds.includes(storeId);
    setFavoriteIds((ids) => (wasFavorite ? ids.filter((id) => id !== storeId) : [...ids, storeId]));
    try {
      if (wasFavorite) {
        await api.delete(`/favorites/${storeId}`);
      } else {
        await api.post("/favorites", { store_id: storeId });
      }
      toast.success(t(wasFavorite ? "store.favoriteRemoved" : "store.favoriteAdded", { store: storeName }));
      // A store taken out of the favourites leaves that list.
      if (favoritesView) refetch();
    } catch (err) {
      console.error(err);
      setFavoriteIds((ids) => (wasFavorite ? [...ids, storeId] : ids.filter((id) => id !== storeId)));
      toast.error(apiErrorMessage(err) || t(wasFavorite ? "store.deleteFavoriteError" : "store.addFavoriteError"));
    }
  };

  // A radius around the restaurant means nothing in another city: choosing one shows all of it.
  const changeCity = (id: string) => {
    setCityId(id);
    if (id && Number(id) !== user?.city_id) setRadius("all");
  };

  // Removes every filter, the default 10 km too (the page starts with it, Očisti takes it away).
  const clearFilters = () => {
    setSearch("");
    setCityId("");
    setRadius("all");
  };

  const radiusLabel = (value: Radius) => (value === "all" ? t("listFilters.noLimit") : t("radius.upTo", { km: value }));
  const cityName = cities.find((city) => String(city.id) === cityId)?.name ?? "";

  const activeFilters: ActiveFilter[] = [];
  if (cityId) {
    activeFilters.push({
      key: "city",
      label: cityName,
      removeLabel: t("listFilters.remove", { filter: t("listFilters.city") }),
      onRemove: () => setCityId(""),
    });
  }
  if (radius !== "all" && !favoritesView) {
    activeFilters.push({
      key: "radius",
      label: radiusLabel(radius),
      removeLabel: t("listFilters.remove", { filter: t("radius.label") }),
      onRemove: () => setRadius("all"),
    });
  }

  const canClear = search.trim() !== "" || activeFilters.length > 0;

  if (loading) return <LoadingSpinner />;

  const radiusApplies = radius !== "all" && !favoritesView && user?.city_id != null;
  const outsideCount = Number(meta?.outside_radius_count ?? 0);
  const filtered = search.trim() !== "" || cityId !== "" || radiusApplies;

  const renderEmpty = () => {
    if (favoritesView && favoriteIds.length === 0 && !filtered) {
      return <EmptyCard testId="stores-empty" icon={HeartOff} title={t("store.noFavoritesTitle")} text={t("store.noFavoritesSubtitle")} />;
    }
    if (filtered) {
      return (
        <EmptyCard
          testId="stores-empty"
          icon={SearchX}
          title={t("store.noResultsTitle")}
          text={radiusApplies && outsideCount > 0 ? t("radius.emptyStores", { radius }) : t("store.noResultsSubtitle")}
          action={{ label: t("filters.clear"), onClick: clearFilters }}
        />
      );
    }
    return <EmptyCard testId="stores-empty" icon={Store} title={t("store.noStoresTitle")} text={t("store.noStoresSubtitle")} />;
  };

  const tabClass = (selected: boolean) =>
    `flex h-11 cursor-pointer items-center gap-2 rounded-full border px-[18px] text-sm font-bold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 sm:h-[38px] ${
      selected ? "border-brand-800 bg-brand-50 text-brand-800" : "border-transparent bg-white text-neutral-600 hover:bg-neutral-50"
    }`;

  return (
    <div className="mx-auto flex max-w-[1136px] flex-col gap-6 pb-10 font-jakarta text-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
            <Store className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">{t("store.title")}</h1>
            <p className="mt-1 text-[15px] text-neutral-600">{t("store.subtitle")}</p>
          </div>
        </div>
        <div role="group" aria-label={t("store.viewLabel")} className="flex gap-1 rounded-full border border-neutral-200 bg-white p-1">
          <button type="button" aria-pressed={!favoritesView} onClick={() => setView("all")} className={tabClass(!favoritesView)}>
            {t("store.allStores")}
          </button>
          <button type="button" aria-pressed={favoritesView} onClick={() => setView("favorites")} className={tabClass(favoritesView)}>
            {t("store.favoritesTab")}
            <span
              data-testid="favorites-count"
              className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-brand-100 px-1.5 text-xs font-extrabold text-brand-800"
            >
              {favoriteIds.length}
            </span>
          </button>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("store.searchPlaceholder")}
        activeFilters={activeFilters}
        onOpenFilters={() => setDrawerOpen(true)}
        filtersOpen={drawerOpen}
        drawerId={DRAWER_ID}
        onClear={clearFilters}
        canClear={canClear}
      />

      {error && stores.length === 0 ? (
        <LoadErrorState />
      ) : stores.length === 0 ? (
        renderEmpty()
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              isFavorite={favoriteIds.includes(store.id)}
              onToggleFavorite={() => toggleFavorite(store.id, store.business_name ?? "")}
            />
          ))}
        </div>
      )}

      <LoadMore shown={stores.length} total={total ?? stores.length} fetching={fetching} onLoadMore={loadMore} />

      {stores.length > 0 && radiusApplies && outsideCount > 0 && (
        <div
          data-testid="more-stores"
          className="flex flex-wrap items-center justify-center gap-4 rounded-[20px] border border-brand-100 bg-brand-50 px-5 py-4"
        >
          <span className="flex items-center gap-2 text-[15px] text-neutral-900">
            <Navigation className="h-[18px] w-[18px] shrink-0 text-brand-800" aria-hidden="true" />
            {t("radius.moreStores", { count: outsideCount, radius })}
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
          <FilterField label={t("listFilters.city")} htmlFor="stores-filter-city">
            <span className="relative block">
              <MapPin className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-500" aria-hidden="true" />
              <CitySelect
                id="stores-filter-city"
                value={cityId}
                onChange={changeCity}
                emptyLabel={t("listFilters.allCities")}
                className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-neutral-200 bg-white pr-10 pl-11 text-base text-neutral-900 outline-none focus:border-brand-800 focus:ring-[3px] focus:ring-brand-100 sm:text-[15px]"
              />
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-600" aria-hidden="true" />
            </span>
          </FilterField>
          {!favoritesView && (
            <FilterPills
              label={t("radius.label")}
              options={RADIUS_OPTIONS.map((value) => ({ value, label: radiusLabel(value) }))}
              value={radius}
              onChange={setRadius}
            />
          )}
        </FilterDrawer>
      )}
    </div>
  );
}

export default StoresPage;
