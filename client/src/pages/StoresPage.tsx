import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { Heart, HeartOff, MapPin, Search, SearchX, Store } from "lucide-react";
import api from "../api/axios.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../components/product/FilterBar.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import StoreCard from "../components/store/StoreCard.js";
import { inputStyle } from "../components/form/FormField.js";
import type { Favorites, User } from "../types/index.js";

function StoresPage() {
  const [city, setCity] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const { t } = useTranslation();
  // "Favorites only" is filtered on the server, so the list and its count cover every store.
  // 12 at a time; a filter change starts again from the first page.
  const filters = { city, business_name: businessName, favorites: showFavoritesOnly ? "true" : "" };
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, JSON.stringify(filters));
  const {
    data: storesList,
    total,
    loading,
    fetching,
    error,
    refetch,
  } = useFetch<User>("/users/stores", "stores", { ...filters, limit });

  const fetchFavorites = async () => {
    try {
      const response = await api.get("/favorites");
      setFavoriteIds(response.data.favorites.map((f: Favorites) => f.id));
    } catch (error) {
      console.error(error);
    }
  };

  const toggleFavorite = async (storeId: number) => {
    const isFavorite = favoriteIds.includes(storeId);
    try {
      if (isFavorite) {
        await api.delete(`/favorites/${storeId}`);
      } else {
        await api.post("/favorites", { store_id: storeId });
      }
      fetchFavorites();
      // A store taken out of favorites leaves the "favorites only" list.
      if (showFavoritesOnly) refetch();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(
        message || (isFavorite ? t("store.deleteFavoriteError") : t("store.addFavoriteError")),
      );
    }
  };

  const clearFilters = () => {
    setCity("");
    setBusinessName("");
    setShowFavoritesOnly(false);
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters = Boolean(city || businessName || showFavoritesOnly);

  const renderEmptyState = () => {
    if (showFavoritesOnly && !city && !businessName) {
      return (
        <EmptyState
          icon={HeartOff}
          title={t("store.noFavoritesTitle")}
          subtitle={t("store.noFavoritesSubtitle")}
        />
      );
    }
    if (hasActiveFilters) {
      return (
        <EmptyState
          icon={SearchX}
          title={t("store.noResultsTitle")}
          subtitle={t("store.noResultsSubtitle")}
        />
      );
    }
    return (
      <EmptyState icon={Store} title={t("store.noStoresTitle")} subtitle={t("store.noStoresSubtitle")} />
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <ProductPageHeader
        title={t("store.title")}
        subtitle={t("store.subtitle")}
        icon={Store}
        count={t("store.count", { count: total ?? storesList.length })}
      />

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters} columns={3}>
        <FilterField icon={Search}>
          <input
            type="text"
            placeholder={t("filters.searchByStore")}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={inputStyle}
          />
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
        <button
          type="button"
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          aria-pressed={showFavoritesOnly}
          className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
            showFavoritesOnly
              ? "border-orange-500 bg-orange-500 text-white shadow-sm shadow-orange-500/20"
              : "border-gray-200 bg-white text-gray-700 hover:border-orange-300 hover:text-orange-600"
          }`}
        >
          <Heart className={`h-4 w-4 ${showFavoritesOnly ? "fill-current" : ""}`} />
          {t("store.onlyFavorites")}
          {favoriteIds.length > 0 && (
            <span
              className={`rounded-full px-1.5 text-xs font-semibold ${
                showFavoritesOnly ? "bg-white/25 text-white" : "bg-orange-100 text-orange-700"
              }`}
            >
              {favoriteIds.length}
            </span>
          )}
        </button>
      </FilterBar>

      {error && storesList.length === 0 ? (
        <LoadErrorState />
      ) : storesList.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {storesList.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              isFavorite={favoriteIds.includes(store.id)}
              onToggleFavorite={() => toggleFavorite(store.id)}
            />
          ))}
        </div>
      )}

      <LoadMore
        shown={storesList.length}
        total={total ?? storesList.length}
        fetching={fetching}
        onLoadMore={loadMore}
      />
    </div>
  );
}

export default StoresPage;
