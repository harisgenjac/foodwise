import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  CircleCheck,
  Clock,
  Hourglass,
  MapPin,
  Package,
  PackageOpen,
  Phone,
  ShoppingBag,
  Store,
  ClipboardList,
} from "lucide-react";
import api from "../api/axios.js";
import { useFetch } from "../hooks/useFetch.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import EmptyState from "../components/product/EmptyState.jsx";
import DetailItem from "../components/product/DetailItem.jsx";
import ReserveProductModal from "../components/product/ReserveProductModal.jsx";
import StatCard from "../components/dashboard/StatCard.jsx";
import DashboardProductCard from "../components/dashboard/DashboardProductCard.jsx";
import DashboardReservationCard from "../components/dashboard/DashboardReservationCard.jsx";
import StoreAvatar from "../components/store/StoreAvatar.jsx";
import FavoriteButton from "../components/store/FavoriteButton.jsx";
import type { Product, Reservation, User, Favorites } from "../types/index.js";

interface StoreStats {
  sold_articles: string;
  successful_reservations: string;
}
interface MyReservationsCount {
  my_reservations_count: string;
}

type Tab = "products" | "reservations";

const RESERVATION_STATUSES: Reservation["status"][] = ["Pending", "Confirmed", "Completed", "Cancelled"];

function StoreDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [myReservations, setMyReservations] = useState<MyReservationsCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("products");
  const [reservationStatus, setReservationStatus] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { t } = useTranslation();
  const reservationStatuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;

  const fetchStoreDetails = async () => {
    try {
      const response = await api.get(`/users/stores/${id}`);
      const storeData: User = response.data.store;
      const productsData: Product[] = response.data.products;
      const reservationsData: MyReservationsCount = response.data.myReservations;
      const statsData: StoreStats = response.data.stats;
      setStore(storeData);
      setProducts(productsData);
      setStats(statsData);
      setMyReservations(reservationsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFavorites = async () => {
    try {
      const response = await api.get("/favorites");
      setIsFavorite(response.data.favorites.some((f: Favorites) => f.id === parseInt(id!)));
    } catch (error) {
      console.error(error);
    }
  };

  const toggleFavorite = async () => {
    try {
      if (isFavorite) {
        await api.delete(`/favorites/${id}`);
        setIsFavorite(false);
        toast.success(t("store.deleteFavoriteSucces"));
      } else {
        await api.post("/favorites", { store_id: id });
        setIsFavorite(true);
        toast.success(t("store.addFavoriteSucces"));
      }
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(
        message || (isFavorite ? t("store.deleteFavoriteError") : t("store.addFavoriteError")),
      );
    }
  };

  useEffect(() => {
    fetchStoreDetails();
    fetchFavorites();
  }, [id]);

  const {
    data: reservationsList,
    loading: reservationsLoading,
    refetch: refetchReservations,
  } = useFetch<Reservation>("/reservations/mine", "reservations", {
    store_id: id!,
    status: reservationStatus,
  });

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!store || !stats || !myReservations) {
    return (
      <div className="mx-auto max-w-5xl pb-10">
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
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "products", label: t("store.productsTab"), count: products.length },
    { key: "reservations", label: t("store.reservationsTab") },
  ];
  const statusFilters = [
    { value: "", label: t("store.allStatuses") },
    ...RESERVATION_STATUSES.map((status) => ({
      value: status,
      label: reservationStatuses[status] || status,
    })),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-orange-50 hover:text-orange-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("store.backButton")}
      </button>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="relative h-28 bg-linear-to-br from-orange-50 via-amber-50/60 to-white">
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-orange-200/30 blur-3xl" />
        </div>

        <div className="flex flex-col gap-5 px-6 pb-6 sm:flex-row sm:items-end">
          <StoreAvatar store={store} className="-mt-14 h-28 w-28 rounded-2xl text-3xl" />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">
              {store.business_name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                <Store className="h-3.5 w-3.5" />
                {t("auth.storeRole")}
              </span>
              {store.city && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {store.city}
                </span>
              )}
            </div>
          </div>

          <FavoriteButton isFavorite={isFavorite} onToggle={toggleFavorite} variant="pill" />
        </div>

        <p className="border-t border-gray-100 px-6 py-4 text-sm leading-relaxed text-gray-600">
          {store.description || t("store.noDescription")}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("store.contactTitle")}</h2>
          <dl className="grid grid-cols-1 gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-1">
            <DetailItem icon={MapPin} label={t("user.address")} value={location || "—"} />
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm">
                <Phone className="h-4 w-4" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <dt className="text-xs text-gray-500">{t("user.phone")}</dt>
                <dd className="font-semibold text-gray-900">
                  {store.phone ? (
                    <a href={`tel:${store.phone}`} className="text-orange-600 hover:underline">
                      {store.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </div>
            <DetailItem icon={Clock} label={t("user.workingHours")} value={store.opening_hours || "—"} />
            <DetailItem icon={Hourglass} label={t("user.pickupHours")} value={store.pickup_hours || "—"} />
          </dl>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3">
          <StatCard icon={Package} label={t("store.activeProducts")} value={products.length} tone="green" />
          <StatCard icon={ShoppingBag} label={t("store.soldProducts")} value={stats.sold_articles} />
          <StatCard
            icon={CircleCheck}
            label={t("store.successfullyReservations")}
            value={stats.successful_reservations}
            tone="amber"
          />
          <StatCard
            icon={CalendarCheck}
            label={t("store.mineReservations")}
            value={myReservations.my_reservations_count}
            tone="gray"
          />
        </div>
      </div>

      <div className="inline-flex w-fit rounded-full border border-gray-100 bg-white p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key ? "bg-orange-500 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-xs font-semibold ${
                  activeTab === tab.key ? "bg-white/25 text-white" : "bg-orange-100 text-orange-700"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "products" &&
        (products.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title={t("store.storeNoProducts")}
            subtitle={t("store.storeNoProductsSubtitle")}
            action={{ to: "/browse-products", label: t("store.browseOtherOffers") }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <DashboardProductCard
                key={product.id}
                product={product}
                actions={
                  <>
                    <Link
                      to={`/products/${product.id}`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100"
                    >
                      {t("dashboard.detailsButton")}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    {parseFloat(product.available_quantity || "0") > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                        className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600"
                      >
                        <CalendarPlus className="h-4 w-4" />
                        {t("myProducts.reserveButton")}
                      </button>
                    )}
                  </>
                }
              />
            ))}
          </div>
        ))}

      {activeTab === "reservations" && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setReservationStatus(filter.value)}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  reservationStatus === filter.value
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-orange-300 hover:text-orange-600"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {reservationsLoading ? (
            <LoadingSpinner />
          ) : reservationsList.length === 0 && reservationStatus ? (
            <EmptyState
              icon={ClipboardList}
              title={t("store.noResultsTitle")}
              subtitle={t("store.noStatusResultsSubtitle")}
            />
          ) : reservationsList.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t("store.restaurantNoRes")}
              subtitle={t("store.restaurantNoResSubtitle")}
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {reservationsList.map((reservation) => (
                <DashboardReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  partyLabel={t("myProducts.store")}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {selectedProduct && (
        <ReserveProductModal
          product={selectedProduct}
          storeLine={[store.business_name, store.city].filter(Boolean).join(" · ")}
          onClose={() => setSelectedProduct(null)}
          onReserved={() => {
            fetchStoreDetails();
            refetchReservations();
          }}
        />
      )}
    </div>
  );
}

export default StoreDetailsPage;
