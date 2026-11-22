import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, Coins, Plus, ReceiptText, Salad } from "lucide-react";
import api from "../api/axios.js";
import HomeHero, { type HeroStat } from "../components/dashboard/HomeHero.js";
import { ShopkeeperIllustration } from "../components/dashboard/HomeIllustrations.js";
import HomeHowItWorks, {
  ChooseDeliveryIllustration,
  ConfirmOrderIllustration,
  PublishOfferIllustration,
} from "../components/dashboard/HomeHowItWorks.js";
import HomeDonateBand from "../components/dashboard/HomeDonateBand.js";
import LocationReminder from "../components/profile/LocationReminder.js";
import TodayCards from "../components/storeHome/TodayCards.js";
import StoreHomeOrders from "../components/storeHome/StoreHomeOrders.js";
import StoreHomeProducts from "../components/storeHome/StoreHomeProducts.js";
import { useLiveOrderRefresh } from "../context/LiveEventsContext.js";
import { formatNumber } from "../utils/numbers.js";
import type { StoreHomeData, StoreImpact } from "../types/index.js";

// The store's home page (design/store-home/store.dc.html), for every STORE account, branches
// included, built from the restaurant home page's components and set in Plus Jakarta Sans: the map
// pin reminder (only without a pin), the hero with the store's stats across the full width of the
// content, then the sections centred at most 1280 px wide, and last the donation band across the
// whole content area, which the footer's arch overlaps (Layout renders that footer flush).
function StoreDashboardPage() {
  const { t, i18n } = useTranslation();
  // null while loading.
  const [impact, setImpact] = useState<StoreImpact | null>(null);
  const [impactFailed, setImpactFailed] = useState(false);
  // The Danas counts and the two lists; null while loading.
  const [home, setHome] = useState<StoreHomeData | null>(null);

  const loadHome = useCallback(() => {
    api
      .get("/stats/store-home")
      .then((response) => setHome(response.data))
      .catch((err) => console.error("Error fetching the store home:", err));
  }, []);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  // A new order, a decision elsewhere or the courier's progress updates the counts and the lists.
  useLiveOrderRefresh(loadHome);

  useEffect(() => {
    api
      .get("/stats/my-impact")
      .then((response) => setImpact(response.data.impact))
      .catch((err) => {
        console.error("Error fetching impact stats:", err);
        setImpactFailed(true);
      });
  }, []);

  const lang = i18n.language;
  // What restaurants picked up from the store: food (kg), CO₂ avoided (kg) and money back in the
  // till (KM), each with its tooltip.
  const stats: HeroStat[] = [
    {
      key: "foodSaved",
      icon: Salad,
      label: t("home.stats.foodSaved"),
      tip: t("storeHome.stats.foodSavedTip"),
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
      key: "revenue",
      icon: Coins,
      label: t("storeHome.stats.revenue"),
      tip: t("storeHome.stats.revenueTip"),
      infoLabel: t("storeHome.stats.revenueInfo"),
      value: impact && `${formatNumber(impact.revenue, lang, 2)} KM`,
    },
  ];

  return (
    <div data-testid="store-home" className="font-jakarta text-neutral-900">
      {/* Hero, the beige section band, How it works and the donation band follow each other with no gaps. */}
      <div>
        <HomeHero
          text={t("storeHome.hero.text")}
          actions={[
            {
              label: t("storeHome.hero.addProduct"),
              to: "/add-product",
              variant: "primary",
              icon: <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} aria-hidden="true" />,
            },
            {
              label: t("storeHome.hero.orders"),
              to: "/orders",
              variant: "outline",
              icon: <ReceiptText className="h-5 w-5" strokeWidth={2} aria-hidden="true" />,
            },
          ]}
          illustration={<ShopkeeperIllustration label={t("storeHome.hero.shopkeeper")} />}
          bubble={t("storeHome.hero.bubble", { returnObjects: true }) as string[]}
          stats={stats}
          statsLabel={t("home.stats.label")}
          statsFailed={impactFailed}
        />

        <div className="-mx-4 bg-sand px-4 pt-8 pb-14 sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-7">
            {/* The map pin reminder (only without a pin) right under the hero. */}
            <LocationReminder />
            <TodayCards today={home?.today ?? null} />
            <StoreHomeOrders orders={home?.orders ?? null} onDecided={loadHome} />
            {home && home.products.length > 0 && <StoreHomeProducts products={home.products} />}
          </div>
        </div>

        <HomeHowItWorks
          title={t("storeHome.howItWorks.title")}
          subtitle={t("storeHome.howItWorks.subtitle")}
          steps={[
            {
              key: "publish",
              illustration: PublishOfferIllustration,
              title: t("storeHome.howItWorks.publish.title"),
              textKey: "storeHome.howItWorks.publish.text",
            },
            {
              key: "confirm",
              illustration: ConfirmOrderIllustration,
              title: t("storeHome.howItWorks.confirm.title"),
              textKey: "storeHome.howItWorks.confirm.text",
            },
            {
              key: "handOver",
              illustration: ChooseDeliveryIllustration,
              title: t("storeHome.howItWorks.handOver.title"),
              textKey: "storeHome.howItWorks.handOver.text",
            },
          ]}
        />

        <HomeDonateBand
          title={t("home.donate.title")}
          text={t("storeHome.donate.text")}
          donateLabel={t("storeHome.donate.donate")}
        />
      </div>
    </div>
  );
}

export default StoreDashboardPage;
