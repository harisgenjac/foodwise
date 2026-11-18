import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ReceiptText } from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import RestaurantHero from "../components/dashboard/RestaurantHero.js";
import ImpactStrip from "../components/dashboard/ImpactStrip.js";
import LocationReminder from "../components/profile/LocationReminder.js";
import SectionCard from "../components/dashboard/SectionCard.js";
import OrderCard from "../components/order/OrderCard.js";
import type { Order, RestaurantImpact } from "../types/index.js";

const SECTION_SIZE = 3;

// The restaurant's home page: the hero animation with the impact strip under it, the map pin
// reminder and its first orders. The two requests are independent: a failed impact load only hides
// the strip.
const RestaurantDashboardPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // null while loading; the strip is hidden when it fails.
  const [impact, setImpact] = useState<RestaurantImpact | null>(null);
  const [impactFailed, setImpactFailed] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const response = await api.get("/orders/mine", { params: { limit: SECTION_SIZE } });
        setOrders(response.data.orders);
      } catch (err) {
        console.error("Error fetching orders:", err);
      } finally {
        setLoading(false);
      }
    };

    const fetchImpact = async () => {
      try {
        const response = await api.get("/stats/my-impact");
        setImpact(response.data.impact);
      } catch (err) {
        console.error("Error fetching impact stats:", err);
        setImpactFailed(true);
      }
    };

    fetchOrders();
    fetchImpact();
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <h1 className="sr-only">{t("sidebar.dashboard")}</h1>
      <div>
        <RestaurantHero attached={!impactFailed} />
        {!impactFailed && <ImpactStrip impact={impact} />}
      </div>

      <LocationReminder />

      {loading ? (
        <LoadingSpinner />
      ) : (
        <SectionCard
          title={t("dashboard.myOrdersTitle")}
          icon={ReceiptText}
          viewAll={{ to: "/my-orders", label: t("dashboard.viewAllOrders") }}
          isEmpty={orders.length === 0}
          empty={{
            icon: ReceiptText,
            text: t("dashboard.noOrders"),
            action: { to: "/search", label: t("dashboard.browseOffers") },
          }}
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} partyLabel={t("myProducts.store")} linkStore />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
};

export default RestaurantDashboardPage;
