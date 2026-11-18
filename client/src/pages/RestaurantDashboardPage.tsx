import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import api from "../api/axios.js";
import RestaurantHero from "../components/dashboard/RestaurantHero.js";
import ImpactStrip from "../components/dashboard/ImpactStrip.js";
import RestaurantActions from "../components/dashboard/RestaurantActions.js";
import StoreCarousel from "../components/dashboard/StoreCarousel.js";
import LocationReminder from "../components/profile/LocationReminder.js";
import type { RestaurantImpact, User } from "../types/index.js";

// The carousel's stores: the store list's visibility rules, nearest first, from all cities.
const CAROUSEL_STORES = { radius: "all", limit: 20 };

// The restaurant's home page, top to bottom: the map pin reminder (only without a pin), the hero
// animation with the impact strip under it, the two main links (search, My orders with the
// active-order count) and the nearest stores. The three requests are independent: a failed one
// only hides its own part (the strip, the badge, the carousel).
const RestaurantDashboardPage = () => {
  // null while loading; the strip is hidden when it fails.
  const [impact, setImpact] = useState<RestaurantImpact | null>(null);
  const [impactFailed, setImpactFailed] = useState(false);
  // Pending + Confirmed + InDelivery, from the My orders summary; null = no badge.
  const [activeOrders, setActiveOrders] = useState<number | null>(null);
  // null while loading; [] (none, or a failed load) hides the carousel.
  const [stores, setStores] = useState<User[] | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchImpact = async () => {
      try {
        const response = await api.get("/stats/my-impact");
        setImpact(response.data.impact);
      } catch (err) {
        console.error("Error fetching impact stats:", err);
        setImpactFailed(true);
      }
    };

    const fetchActiveOrders = async () => {
      try {
        const response = await api.get("/orders/mine/summary");
        setActiveOrders(response.data.summary.active);
      } catch (err) {
        console.error("Error fetching the order summary:", err);
      }
    };

    const fetchStores = async () => {
      try {
        const response = await api.get("/users/stores", { params: CAROUSEL_STORES });
        setStores(response.data.stores);
      } catch (err) {
        console.error("Error fetching stores:", err);
        setStores([]);
      }
    };

    fetchImpact();
    fetchActiveOrders();
    fetchStores();
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <h1 className="sr-only">{t("sidebar.dashboard")}</h1>
      <LocationReminder />

      <div>
        <RestaurantHero attached={!impactFailed} />
        {!impactFailed && <ImpactStrip impact={impact} />}
      </div>

      <RestaurantActions activeOrders={activeOrders} />

      {(stores === null || stores.length > 0) && <StoreCarousel stores={stores} />}
    </div>
  );
};

export default RestaurantDashboardPage;
