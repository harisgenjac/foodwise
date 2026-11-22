import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ArrowRight, Cloud, Coins, Salad } from "lucide-react";
import api from "../api/axios.js";
import HomeHero, { type HeroStat } from "../components/dashboard/HomeHero.js";
import { ChefIllustration, ScooterIcon } from "../components/dashboard/HomeIllustrations.js";
import HomeStoreSlider from "../components/dashboard/HomeStoreSlider.js";
import HomeOffers from "../components/dashboard/HomeOffers.js";
import HomeHowItWorks, {
  ChooseDeliveryIllustration,
  CookTodayIllustration,
  FindOfferIllustration,
} from "../components/dashboard/HomeHowItWorks.js";
import HomeDonateBand from "../components/dashboard/HomeDonateBand.js";
import LocationReminder from "../components/profile/LocationReminder.js";
import { formatNumber } from "../utils/numbers.js";
import type { HomeStore, RestaurantImpact, User } from "../types/index.js";

// The slider's stores: the store list's visibility rules, nearest first, from all cities.
const SLIDER_STORES = { radius: "all", limit: 20 };

// The restaurant's home page (design/restaurant-home/home.dc.html), in Plus Jakarta Sans: the map pin
// reminder (only without a pin), the hero with the restaurant's impact stats across the full width
// of the content, then the sections centred at most 1280 px wide: the store slider, "Order now for
// less" (store rows with offers) and "From the shelf to your kitchen"; last the donation band across
// the whole content area, which the footer's arch overlaps (Layout renders that footer flush). The
// requests are independent: a failed one only hides its own part (the stats, the slider, the rows).
const RestaurantDashboardPage = () => {
  const { t, i18n } = useTranslation();
  // null while loading.
  const [impact, setImpact] = useState<RestaurantImpact | null>(null);
  const [impactFailed, setImpactFailed] = useState(false);
  // null while loading; [] (none, or a failed load) hides the section.
  const [stores, setStores] = useState<User[] | null>(null);
  const [offers, setOffers] = useState<HomeStore[] | null>(null);

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

    const fetchOffers = async () => {
      try {
        const response = await api.get("/products/home");
        setOffers(response.data.stores);
      } catch (err) {
        console.error("Error fetching home offers:", err);
        setOffers([]);
      }
    };

    fetchImpact();
    fetchStores();
    fetchOffers();
  }, []);

  const lang = i18n.language;
  // The hero: food saved (kg), CO₂ avoided (kg) and money saved (KM), each with its tooltip.
  const stats: HeroStat[] = [
    {
      key: "foodSaved",
      icon: Salad,
      label: t("home.stats.foodSaved"),
      tip: t("restaurantHome.stats.foodSavedTip"),
      infoLabel: t("home.stats.foodSavedInfo"),
      value: impact && `${formatNumber(impact.food_kg, lang, 1)} kg`,
    },
    {
      key: "co2",
      icon: Cloud,
      label: t("home.stats.co2"),
      tip: t("home.stats.co2Tip"),
      infoLabel: t("home.stats.co2Info"),
      value: impact && `${formatNumber(impact.co2_kg, lang, 1)} kg`,
    },
    {
      key: "saved",
      icon: Coins,
      label: t("restaurantHome.stats.saved"),
      tip: t("restaurantHome.stats.savedTip"),
      infoLabel: t("restaurantHome.stats.savedInfo"),
      value: impact && `${formatNumber(impact.savings, lang, 2)} KM`,
    },
  ];

  return (
    <div data-testid="restaurant-home" className="space-y-6 font-jakarta text-neutral-900">
      <LocationReminder />

      {/* Hero, the beige section band, How it works and the donation band follow each other with no gaps. */}
      <div>
        <HomeHero
          text={t("restaurantHome.hero.text")}
          actions={[
            {
              label: t("restaurantHome.hero.shopNow"),
              to: "/search",
              variant: "primary",
              icon: <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" />,
              iconAfter: true,
            },
            // The live tracking page does not exist yet.
            {
              label: t("restaurantHome.hero.trackDelivery"),
              onClick: () => toast(t("restaurantHome.hero.comingSoon")),
              variant: "outline",
              icon: <ScooterIcon className="h-5 w-5" />,
            },
          ]}
          illustration={<ChefIllustration label={t("restaurantHome.hero.chef")} />}
          bubble={t("restaurantHome.hero.bubble", { returnObjects: true }) as string[]}
          stats={stats}
          statsLabel={t("home.stats.label")}
          statsFailed={impactFailed}
        />

        <div className="-mx-4 bg-sand px-4 pt-8 pb-14 sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-7">
            {(stores === null || stores.length > 0) && <HomeStoreSlider stores={stores} />}
            {(offers === null || offers.length > 0) && <HomeOffers stores={offers} />}
          </div>
        </div>

        <HomeHowItWorks
          title={t("restaurantHome.howItWorks.title")}
          subtitle={t("restaurantHome.howItWorks.subtitle")}
          steps={[
            { key: "find", illustration: FindOfferIllustration, title: t("restaurantHome.howItWorks.find.title"), textKey: "restaurantHome.howItWorks.find.text" },
            { key: "choose", illustration: ChooseDeliveryIllustration, title: t("restaurantHome.howItWorks.choose.title"), textKey: "restaurantHome.howItWorks.choose.text" },
            { key: "cook", illustration: CookTodayIllustration, title: t("restaurantHome.howItWorks.cook.title"), textKey: "restaurantHome.howItWorks.cook.text" },
          ]}
        />

        <HomeDonateBand
          title={t("home.donate.title")}
          text={t("restaurantHome.donate.text")}
          donateLabel={t("restaurantHome.donate.donate")}
        />
      </div>
    </div>
  );
};

export default RestaurantDashboardPage;
