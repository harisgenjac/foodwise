import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { Clock, Flame, Hourglass, MapPin, PackageOpen, Percent, Phone, Search, ShoppingBag, Store } from "lucide-react";
import api, { assetUrl } from "../api/axios.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { useAddToCart } from "../hooks/useAddToCart.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import Breadcrumbs, { BreadcrumbPlaceholder } from "../components/Breadcrumbs.js";
import EmptyState from "../components/product/EmptyState.js";
import StatCard from "../components/dashboard/StatCard.js";
import StoreAvatar from "../components/store/StoreAvatar.js";
import ChainLabel from "../components/store/ChainLabel.js";
import FavoriteButton from "../components/store/FavoriteButton.js";
import StoreProductCard from "../components/store/StoreProductCard.js";
import { StoreCartBar, StoreCartPanel } from "../components/store/StoreCart.js";
import Tabs from "../components/common/Tabs.js";
import { dayHoursText, hoursText, scheduleLines, todayWeekday, type Schedule } from "../utils/schedule.js";
import type { Favorites, Product, User } from "../types/index.js";

interface StoreStats {
  active_offers: number;
  expiring_today: number;
  max_discount: number;
}

type Tab = "products" | "info";

// The store page loads every offer at once (up to the server's page limit) to group them.
const PAGE = 100;
// "Expiring soon": today or tomorrow.
const SOON_DAYS = 1;

const productGrid = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4";

// The store page (restaurants): the cover, logo, name, address, today's pickup hours and "open now";
// short stats; the Products tab (search, category chips, "Expiring soon" first, then by category,
// each with + and a quantity stepper) and the Information tab. The cart is a bar on phones and a
// panel on the right from lg up.
function StoreDetailsPage() {
  const { id } = useParams();
  const storeId = Number(id);
  const { t } = useTranslation();
  const [store, setStore] = useState<User | null>(null);
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("products");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const cartActions = useAddToCart();
  const categoryLabels = t("categories", { returnObjects: true }) as Record<string, string>;

  useEffect(() => {
    const fetchStore = async () => {
      try {
        const response = await api.get(`/users/stores/${id}`);
        setStore(response.data.store);
        setStats(response.data.stats);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    const fetchFavorites = async () => {
      try {
        const response = await api.get("/favorites");
        setIsFavorite(response.data.favorites.some((f: Favorites) => f.id === storeId));
      } catch (error) {
        console.error(error);
      }
    };
    fetchStore();
    fetchFavorites();
  }, [id, storeId]);

  const toggleFavorite = async () => {
    try {
      if (isFavorite) {
        await api.delete(`/favorites/${id}`);
        setIsFavorite(false);
      } else {
        await api.post("/favorites", { store_id: id });
        setIsFavorite(true);
      }
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || (isFavorite ? t("store.deleteFavoriteError") : t("store.addFavoriteError")));
    }
  };

  // The store's offers through the marketplace (same rules), soonest expiry first.
  const paging = usePagedLimit(PAGE, String(id));
  const { data: products, total, loading: productsLoading, fetching } = useFetch<Product>("/products", "products", {
    store_id: id!,
    sort: "expiry",
    limit: paging.limit,
  });

  // The categories this store has on offer, in the usual category order.
  const presentCategories = Object.keys(categoryLabels).filter((key) =>
    products.some((product) => product.category === key),
  );
  const query = search.trim().toLowerCase();
  const shown = products.filter(
    (product) => (!category || product.category === category) && (!query || product.name.toLowerCase().includes(query)),
  );
  const soon = shown.filter((product) => (product.days_until_expiry ?? 99) <= SOON_DAYS);
  const later = shown.filter((product) => (product.days_until_expiry ?? 99) > SOON_DAYS);
  const groups = presentCategories
    .map((key) => ({ key, items: later.filter((product) => product.category === key) }))
    .filter((group) => group.items.length > 0);

  const section = { label: t("sidebar.stores"), to: "/stores" };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl pb-10">
        <Breadcrumbs items={[section, { label: <BreadcrumbPlaceholder /> }]} />
        <LoadingSpinner />
      </div>
    );
  }

  if (!store || !stats) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-10">
        <Breadcrumbs items={[section]} />
        <EmptyState
          icon={Store}
          title={t("store.storeNotFound")}
          subtitle={t("store.storeNotFoundSubtitle")}
          action={{ to: "/stores", label: t("store.backToStores") }}
        />
      </div>
    );
  }

  const location = [store.address, store.city].filter(Boolean).join(", ");
  const pickupSchedule = store.pickup_schedule ?? null;
  const todayPickup = pickupSchedule
    ? t("store.page.pickupToday", { hours: dayHoursText(pickupSchedule[todayWeekday()], t) })
    : store.pickup_hours
      ? `${t("user.pickupHours")}: ${store.pickup_hours}`
      : null;

  const renderCard = (product: Product) => (
    <StoreProductCard
      key={product.id}
      product={product}
      inCart={cartActions.quantityOf(product.id)}
      busy={cartActions.busyId === product.id}
      onSetQuantity={(quantity) => cartActions.setQuantity(product, quantity)}
    />
  );

  const hoursBlock = (label: string, schedule: Schedule | null | undefined, legacy: string | undefined, Icon: typeof Clock) => (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        {schedule ? (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
            {scheduleLines(schedule, t).map((line) => (
              <div key={line.days} className="contents">
                <dt className="text-gray-600">{line.days}</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">{line.hours}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="font-semibold text-gray-900">{hoursText(null, legacy, t) ?? "—"}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24 lg:pb-10">
      <Breadcrumbs items={[section, { label: store.business_name }]} />

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="relative h-32 bg-linear-to-br from-orange-50 via-amber-50/60 to-white sm:h-44">
          {store.cover_url ? (
            <img src={assetUrl(store.cover_url)} alt="" data-testid="store-cover" className="h-full w-full object-cover" />
          ) : (
            <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-orange-200/30 blur-3xl" />
          )}
        </div>

        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:px-6">
          <StoreAvatar store={store} className="relative z-10 -mt-12 h-24 w-24 rounded-2xl border-4 border-white text-2xl shadow-md sm:-mt-14 sm:h-28 sm:w-28" />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{store.business_name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {store.open_now !== null && store.open_now !== undefined && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    store.open_now ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${store.open_now ? "bg-green-500" : "bg-gray-400"}`} />
                  {store.open_now ? t("store.page.openNow") : t("store.page.closedNow")}
                </span>
              )}
              <ChainLabel company={store.company_name} className="px-2.5 py-1" />
            </div>
            <div className="flex flex-col gap-1 text-sm text-gray-600 sm:flex-row sm:flex-wrap sm:gap-x-4">
              {location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                  {location}
                </span>
              )}
              {todayPickup && (
                <span className="inline-flex items-center gap-1.5">
                  <Hourglass className="h-4 w-4 shrink-0 text-gray-400" />
                  {todayPickup}
                </span>
              )}
            </div>
          </div>
          <FavoriteButton isFavorite={isFavorite} onToggle={toggleFavorite} variant="pill" />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard icon={ShoppingBag} label={t("store.page.activeOffers")} value={stats.active_offers} tone="green" />
        <StatCard icon={Flame} label={t("store.page.expiringToday")} value={stats.expiring_today} tone="red" />
        <StatCard icon={Percent} label={t("store.page.maxDiscount")} value={`${stats.max_discount}%`} tone="amber" />
      </div>

      <Tabs
        label={t("store.page.tabsLabel")}
        idPrefix="store"
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: "products", label: t("store.productsTab"), count: total ?? products.length },
          { key: "info", label: t("store.page.infoTab") },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {activeTab === "products" ? (
            <div role="tabpanel" id="store-panel-products" aria-labelledby="store-tab-products" className="space-y-5">
              {productsLoading ? (
                <LoadingSpinner />
              ) : products.length === 0 ? (
                <EmptyState
                  icon={PackageOpen}
                  title={t("store.storeNoProducts")}
                  subtitle={t("store.storeNoProductsSubtitle")}
                  action={{ to: "/search", label: t("store.browseOtherOffers") }}
                />
              ) : (
                <>
                  <div className="space-y-3">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("store.page.searchPlaceholder")}
                        aria-label={t("store.page.searchPlaceholder")}
                        className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-3 pl-9 text-base focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none sm:text-sm"
                      />
                    </label>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={t("store.page.categoriesLabel")}>
                      {[{ key: "", label: t("store.page.allCategories") }, ...presentCategories.map((key) => ({ key, label: categoryLabels[key] ?? key }))].map(
                        (chip) => (
                          <button
                            key={chip.key || "all"}
                            type="button"
                            aria-pressed={category === chip.key}
                            onClick={() => setCategory(chip.key)}
                            className={`min-h-11 shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:min-h-0 ${
                              category === chip.key
                                ? "border-orange-500 bg-orange-500 text-white"
                                : "border-gray-200 bg-white text-gray-600 hover:border-orange-300 hover:text-orange-600"
                            }`}
                          >
                            {chip.label}
                          </button>
                        ),
                      )}
                    </div>
                  </div>

                  {shown.length === 0 ? (
                    <EmptyState icon={Search} title={t("store.noResultsTitle")} subtitle={t("store.page.noResultsSubtitle")} />
                  ) : (
                    <>
                      {soon.length > 0 && (
                        <section aria-labelledby="store-soon" className="space-y-3">
                          <h2 id="store-soon" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                            <Flame className="h-5 w-5 text-red-500" />
                            {t("store.page.expiringSoon")}
                          </h2>
                          <div className={productGrid}>{soon.map(renderCard)}</div>
                        </section>
                      )}
                      {groups.map((group) => (
                        <section key={group.key} aria-labelledby={`store-cat-${group.key}`} className="space-y-3">
                          <h2 id={`store-cat-${group.key}`} className="text-lg font-semibold text-gray-900">
                            {categoryLabels[group.key] ?? group.key}
                          </h2>
                          <div className={productGrid}>{group.items.map(renderCard)}</div>
                        </section>
                      ))}
                    </>
                  )}
                  <LoadMore shown={products.length} total={total ?? products.length} fetching={fetching} onLoadMore={paging.loadMore} />
                </>
              )}
            </div>
          ) : (
            <div
              role="tabpanel"
              id="store-panel-info"
              aria-labelledby="store-tab-info"
              className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="grid grid-cols-1 gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">
                    <MapPin className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">{t("user.address")}</p>
                    <p className="font-semibold text-gray-900">{location || "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">
                    <Phone className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">{t("user.phone")}</p>
                    <p className="font-semibold text-gray-900">
                      {store.phone ? (
                        <a href={`tel:${store.phone}`} className="text-orange-600 hover:underline">
                          {store.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </div>
                {hoursBlock(t("user.workingHours"), store.opening_schedule, store.opening_hours, Clock)}
                {hoursBlock(t("user.pickupHours"), store.pickup_schedule, store.pickup_hours, Hourglass)}
              </div>
              <div>
                <h2 className="mb-1 text-sm font-semibold text-gray-900">{t("store.page.about")}</h2>
                <p className="text-sm leading-relaxed text-gray-600">{store.description || t("store.noDescription")}</p>
              </div>
            </div>
          )}
        </div>

        <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <StoreCartPanel storeId={storeId} actions={cartActions} />
        </aside>
      </div>

      <StoreCartBar />
      {cartActions.confirmDialog}
    </div>
  );
}

export default StoreDetailsPage;
