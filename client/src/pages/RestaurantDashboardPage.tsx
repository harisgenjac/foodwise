import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  CheckCircle2,
  Hourglass,
  PiggyBank,
  ShoppingBasket,
} from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import DashboardHero from "../components/dashboard/DashboardHero.jsx";
import StatCard from "../components/dashboard/StatCard.jsx";
import SectionCard from "../components/dashboard/SectionCard.jsx";
import DashboardProductCard from "../components/dashboard/DashboardProductCard.jsx";
import DashboardReservationCard from "../components/dashboard/DashboardReservationCard.jsx";
import { getDaysUntilExpiry } from "../utils/expiry.js";
import type { Reservation, Product } from "../types/index.js";

const RestaurantDashboardPage = () => {
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [reservationsList, setReservationsList] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { t } = useTranslation();

  const fetchProducts = async () => {
    try {
      const response = await api.get("/products");
      const data: Product[] = response.data.products;
      setProductsList(data);
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  const fetchReservations = async () => {
    try {
      const response = await api.get("/reservations/mine");
      const data: Reservation[] = response.data.reservations;
      setReservationsList(data);
    } catch (err) {
      console.error("Error fetching reservations:", err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchProducts(), fetchReservations()]);

      setLoading(false);
    };

    loadData();
  }, []);

  const bestOffers = useMemo(
    () =>
      [...productsList]
        .sort((a, b) => getDaysUntilExpiry(a) - getDaysUntilExpiry(b))
        .slice(0, 3),
    [productsList],
  );

  const stats = useMemo(() => {
    const confirmed = reservationsList.filter(
      (r) => r.status === "Confirmed" || r.status === "Completed",
    );
    const savings = confirmed.reduce(
      (sum, r) =>
        sum +
        (Number(r.original_price ?? 0) - Number(r.discounted_price ?? 0)) *
          Number(r.quantity),
      0,
    );

    return {
      offers: productsList.length,
      pending: reservationsList.filter((r) => r.status === "Pending").length,
      confirmed: confirmed.length,
      savings: `${savings.toFixed(2)} KM`,
    };
  }, [productsList, reservationsList]);

  if (loading) {
    return <LoadingSpinner />;
  }

  const details = [user?.business_name, user?.city].filter(Boolean).join(" · ");

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <DashboardHero
        title={t("dashboard.greeting", { name: user?.first_name ?? "" })}
        subtitle={t("dashboard.restaurantSubtitle")}
        details={details || undefined}
        action={{ to: "/browse-products", label: t("dashboard.browseOffers"), icon: ShoppingBasket }}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={ShoppingBasket} label={t("dashboard.statAvailableOffers")} value={stats.offers} />
        <StatCard icon={Hourglass} label={t("dashboard.statPending")} value={stats.pending} tone="amber" />
        <StatCard icon={CheckCircle2} label={t("dashboard.statConfirmed")} value={stats.confirmed} tone="green" />
        <StatCard icon={PiggyBank} label={t("dashboard.statSavings")} value={stats.savings} tone="green" />
      </div>

      <div className="space-y-10">
        <SectionCard
          title={t("dashboard.bestOffersTitle")}
          icon={ShoppingBasket}
          viewAll={{ to: "/browse-products", label: t("dashboard.viewAllProducts") }}
          isEmpty={bestOffers.length === 0}
          empty={{ icon: ShoppingBasket, text: t("dashboard.noProducts") }}
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {bestOffers.map((product) => (
              <DashboardProductCard key={product.id} product={product} showStore />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title={t("dashboard.recentReservationsTitle")}
          icon={CalendarCheck}
          viewAll={{ to: "/my-reservations", label: t("dashboard.viewAllReservations") }}
          isEmpty={reservationsList.length === 0}
          empty={{
            icon: CalendarCheck,
            text: t("dashboard.noReservations"),
            action: { to: "/browse-products", label: t("dashboard.browseOffers") },
          }}
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {reservationsList.slice(0, 3).map((reservation) => (
              <DashboardReservationCard key={reservation.id} reservation={reservation} partyLabel={t("myProducts.store")} />
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

export default RestaurantDashboardPage;
