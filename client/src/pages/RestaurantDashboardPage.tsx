import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  BadgePercent,
  CheckCircle2,
  Hourglass,
  ShoppingBasket,
  ReceiptText,
} from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import DashboardHero from "../components/dashboard/DashboardHero.js";
import StatCard from "../components/dashboard/StatCard.js";
import SectionCard from "../components/dashboard/SectionCard.js";
import DashboardProductCard from "../components/dashboard/DashboardProductCard.js";
import OrderCard from "../components/order/OrderCard.js";
import { DEFAULT_RADIUS, nextRadius, type Radius } from "../utils/radius.js";
import type { Order, Product, RestaurantDashboardStats } from "../types/index.js";

const SECTION_SIZE = 3;

const RestaurantDashboardPage = () => {
  // The three offers closest to expiry nearby, and how many offers that radius has.
  const [bestOffers, setBestOffers] = useState<Product[]>([]);
  const [offersCount, setOffersCount] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<RestaurantDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { t } = useTranslation();

  // The stat cards come from the server over all reservations; the list is only the first few orders.
  const fetchStats = async () => {
    try {
      const response = await api.get("/dashboard/stats");
      setStats(response.data.stats);
    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
    }
  };

  // The soonest-expiring offers within 10 km. When there are fewer than three, the list is filled
  // from 20 km, then 50 km, then all cities: closer offers stay first and each wider request adds
  // the next ones by expiry (its result includes the closer ones, skipped by id). The count is the
  // widest radius asked for, so it never shows 0 next to offers from further away.
  const fetchProducts = async () => {
    try {
      let offers: Product[] = [];
      let radius: Radius = DEFAULT_RADIUS;
      for (;;) {
        const response = await api.get("/products", {
          params: { sort: "expiry", radius, limit: SECTION_SIZE + offers.length },
        });
        const shownIds = new Set(offers.map((offer) => offer.id));
        const added = (response.data.products as Product[]).filter((product) => !shownIds.has(product.id));
        offers = [...offers, ...added].slice(0, SECTION_SIZE);
        setOffersCount(response.data.total);
        if (offers.length >= SECTION_SIZE || radius === "all" || !response.data.outside_radius_count) break;
        radius = nextRadius(radius);
      }
      setBestOffers(offers);
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await api.get("/orders/mine", { params: { limit: SECTION_SIZE } });
      setOrders(response.data.orders);
    } catch (err) {
      console.error("Error fetching orders:", err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchStats(), fetchProducts(), fetchOrders()]);

      setLoading(false);
    };

    loadData();
  }, []);

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
        <StatCard icon={ShoppingBasket} label={t("dashboard.statAvailableOffers")} value={offersCount} />
        <StatCard icon={Hourglass} label={t("dashboard.statPending")} value={stats?.pending_orders ?? 0} tone="amber" />
        <StatCard icon={CheckCircle2} label={t("dashboard.statConfirmed")} value={stats?.successful_orders ?? 0} tone="green" />
        <StatCard icon={BadgePercent} label={t("dashboard.statSavings")} value={`${(stats?.savings ?? 0).toFixed(2)} KM`} tone="green" />
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
          title={t("dashboard.myOrdersTitle")}
          icon={ReceiptText}
          viewAll={{ to: "/my-orders", label: t("dashboard.viewAllOrders") }}
          isEmpty={orders.length === 0}
          empty={{
            icon: ReceiptText,
            text: t("dashboard.noOrders"),
            action: { to: "/browse-products", label: t("dashboard.browseOffers") },
          }}
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} partyLabel={t("myProducts.store")} linkStore />
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

export default RestaurantDashboardPage;
