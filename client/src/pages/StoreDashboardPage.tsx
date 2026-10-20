import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  CheckCircle2,
  Hourglass,
  Leaf,
  Package,
  PackagePlus,
} from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import DashboardHero from "../components/dashboard/DashboardHero.js";
import StatCard from "../components/dashboard/StatCard.js";
import SectionCard from "../components/dashboard/SectionCard.js";
import DashboardProductCard from "../components/dashboard/DashboardProductCard.js";
import DashboardReservationCard from "../components/dashboard/DashboardReservationCard.js";
import { formatSavedFood, getSavedFoodTotals } from "../utils/savedFood.js";
import type { Product, Reservation } from "../types/index.js";

function StoreDashboardPage() {
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [reservationsList, setReservationsList] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { t } = useTranslation();

  const fetchProducts = async () => {
    try {
      const response = await api.get("/products/mine");
      const data: Product[] = response.data.products;
      setProductsList(data);
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  const fetchReservations = async () => {
    try {
      const response = await api.get("/reservations/store");
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

  // The API already orders products newest first within each status.
  const availableProducts = useMemo(
    () => productsList.filter((product) => product.status === "Available"),
    [productsList],
  );

  const stats = useMemo(
    () => ({
      active: availableProducts.length,
      pending: reservationsList.filter((r) => r.status === "Pending").length,
      confirmed: reservationsList.filter(
        (r) => r.status === "Confirmed" || r.status === "Completed",
      ).length,
      savedFood: formatSavedFood(
        getSavedFoodTotals(reservationsList),
        t("dashboard.piecesShort"),
      ),
    }),
    [availableProducts, reservationsList, t],
  );

  if (loading) {
    return <LoadingSpinner />;
  }

  const details = [user?.business_name, user?.city].filter(Boolean).join(" · ");

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <DashboardHero
        title={t("dashboard.greeting", { name: user?.first_name ?? "" })}
        subtitle={t("dashboard.storeSubtitle")}
        details={details || undefined}
        action={{ to: "/add-product", label: t("dashboard.addProduct"), icon: PackagePlus }}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Package} label={t("dashboard.statActiveProducts")} value={stats.active} />
        <StatCard icon={Hourglass} label={t("dashboard.statPending")} value={stats.pending} tone="amber" />
        <StatCard icon={CheckCircle2} label={t("dashboard.statConfirmed")} value={stats.confirmed} tone="green" />
        <StatCard
          icon={Leaf}
          label={t("dashboard.statSavedFood")}
          value={stats.savedFood[0] ?? "0 kg"}
          detail={stats.savedFood.slice(1).join(" · ") || undefined}
          tone="green"
        />
      </div>

      <div className="space-y-10">
        <SectionCard
          title={t("dashboard.myProductsTitle")}
          icon={Package}
          viewAll={{ to: "/my-products", label: t("dashboard.viewAllProducts") }}
          isEmpty={availableProducts.length === 0}
          empty={{
            icon: Package,
            text: t("dashboard.noProductsStore"),
            action: { to: "/add-product", label: t("dashboard.addProduct") },
          }}
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {availableProducts.slice(0, 3).map((product) => (
              <DashboardProductCard key={product.id} product={product} />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title={t("dashboard.recentReservationsTitle")}
          icon={CalendarCheck}
          viewAll={{ to: "/reservations", label: t("dashboard.viewAllReservations") }}
          isEmpty={reservationsList.length === 0}
          empty={{ icon: CalendarCheck, text: t("dashboard.noReservations") }}
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {reservationsList.slice(0, 3).map((reservation) => (
              <DashboardReservationCard key={reservation.id} reservation={reservation} partyLabel={t("dashboard.restaurantName")} />
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default StoreDashboardPage;
