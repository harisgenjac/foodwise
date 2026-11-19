import { useEffect, useState } from "react";
import api from "../api/axios.js";
import HomeHero from "../components/dashboard/HomeHero.js";
import HomeStoreSlider from "../components/dashboard/HomeStoreSlider.js";
import LocationReminder from "../components/profile/LocationReminder.js";
import type { RestaurantImpact, User } from "../types/index.js";

// The slider's stores: the store list's visibility rules, nearest first, from all cities.
const SLIDER_STORES = { radius: "all", limit: 20 };

// The restaurant's home page (design/restaurant-home/home.dc.html), in Plus Jakarta Sans: the map pin
// reminder (only without a pin), the hero with the restaurant's impact stats across the full width
// of the content, then the sections centred at most 1280 px wide: the store slider. The requests are
// independent: a failed one only hides its own part (the stats, the slider).
const RestaurantDashboardPage = () => {
  // null while loading.
  const [impact, setImpact] = useState<RestaurantImpact | null>(null);
  const [impactFailed, setImpactFailed] = useState(false);
  // null while loading; [] (none, or a failed load) hides the slider.
  const [stores, setStores] = useState<User[] | null>(null);

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

    const fetchStores = async () => {
      try {
        const response = await api.get("/users/stores", { params: SLIDER_STORES });
        setStores(response.data.stores);
      } catch (err) {
        console.error("Error fetching stores:", err);
        setStores([]);
      }
    };

    fetchImpact();
    fetchStores();
  }, []);

  return (
    <div data-testid="restaurant-home" className="space-y-6 pb-10 font-jakarta text-neutral-900">
      <LocationReminder />

      <HomeHero impact={impact} statsFailed={impactFailed} />

      <div className="mx-auto flex max-w-[1280px] flex-col gap-7">
        {(stores === null || stores.length > 0) && <HomeStoreSlider stores={stores} />}
      </div>
    </div>
  );
};

export default RestaurantDashboardPage;
