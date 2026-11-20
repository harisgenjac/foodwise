import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ArrowRight, Cloud, Coins, Salad, type LucideIcon } from "lucide-react";
import InfoTooltip from "../common/InfoTooltip.js";
import { ChefIllustration, HeroDoodles, ScooterIcon } from "./HomeIllustrations.js";
import { BRAND_NAME } from "../../utils/brand.js";
import { formatNumber } from "../../utils/numbers.js";
import type { RestaurantImpact } from "../../types/index.js";

// The chef's speech bubble shows its next message after this long.
export const BUBBLE_INTERVAL_MS = 3000;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// The bubble above the chef: the messages take turns every 3 s, each fading in; with reduced motion
// the first one stays. A polite live region, so screen readers hear the new message.
function SpeechBubble() {
  const { t } = useTranslation();
  const messages = t("restaurantHome.hero.bubble", { returnObjects: true }) as string[];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion() || messages.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % messages.length), BUBBLE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [messages.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="home-bubble"
      // In the design the bubble starts 230 px left of the column's centre; never past its left edge.
      className="absolute top-[34px] left-[max(12px,calc(50%-230px))] z-[1] h-[76px] w-[250px] rounded-[18px] bg-white text-brand-900 shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
    >
      <p
        key={index}
        className="absolute inset-0 flex items-center justify-center px-[18px] text-center text-base leading-[1.3] font-bold motion-safe:animate-bubble-message"
      >
        {messages[index % messages.length]}
      </p>
      <svg width="28" height="18" viewBox="0 0 28 18" aria-hidden="true" className="absolute right-[34px] -bottom-3.5">
        <path d="M0 0h28L22 18z" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

interface Stat {
  key: "foodSaved" | "co2" | "saved";
  icon: LucideIcon;
  value: (impact: RestaurantImpact, language: string) => string;
}

const STATS: Stat[] = [
  { key: "foodSaved", icon: Salad, value: (impact, lang) => `${formatNumber(impact.food_kg, lang, 1)} kg` },
  { key: "co2", icon: Cloud, value: (impact, lang) => `${formatNumber(impact.co2_kg, lang, 1)} kg` },
  { key: "saved", icon: Coins, value: (impact, lang) => `${formatNumber(impact.savings, lang, 2)} KM` },
];

// The three numbers at the bottom of the hero, under a thin line: the restaurant's own food saved,
// CO₂ avoided and money saved, each with an InfoTooltip. Pulse bars while loading.
function HeroStats({ impact }: { impact: RestaurantImpact | null }) {
  const { t, i18n } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("restaurantHome.stats.label")}
      aria-busy={!impact}
      data-testid="home-stats"
      className="relative mx-6 grid basis-full grid-cols-1 gap-5 border-t border-[#1F6B3D] pt-[26px] pb-16 sm:mx-10 sm:grid-cols-3 sm:gap-4 sm:pb-[70px]"
    >
      {STATS.map(({ key, icon: Icon, value }) => (
        <div key={key} className="relative flex items-center gap-3.5 sm:justify-center">
          <Icon className="h-9 w-9 shrink-0 text-brand-300 sm:h-[42px] sm:w-[42px]" strokeWidth={1.6} aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[15px] text-brand-100">
              <span>{t(`restaurantHome.stats.${key}`)}</span>
              <InfoTooltip
                icon={Icon}
                title={t(`restaurantHome.stats.${key}`)}
                text={t(`restaurantHome.stats.${key}Tip`)}
                label={t(`restaurantHome.stats.${key}Info`)}
              />
            </div>
            <p data-testid="home-stat-value" className="text-[26px] leading-[1.1] font-extrabold text-white sm:text-[32px]">
              {impact ? (
                value(impact, i18n.language)
              ) : (
                <span className="inline-block h-[1em] w-28 animate-pulse rounded bg-white/20 align-middle" aria-hidden="true" />
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

interface HomeHeroProps {
  // The restaurant's impact; null while loading.
  impact: RestaurantImpact | null;
  // The stats are left out when they fail to load.
  statsFailed?: boolean;
}

// The top of the restaurant home page (design/restaurant-home/home.dc.html): a dark green band with
// faint food drawings, the brand as the page's h1 ("vrijedi" in lime), a short text, "Shop now"
// (to Search) and "Track delivery" (not built yet: a "Coming soon" toast), the chef with his speech
// bubble on the right, the impact stats at the bottom, and a soft curve into the page.
function HomeHero({ impact, statsFailed = false }: HomeHeroProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [firstWord, ...rest] = BRAND_NAME.split(" ");

  return (
    <section
      aria-labelledby={titleId}
      data-testid="home-hero"
      className="relative flex flex-wrap overflow-hidden rounded-t-[28px] bg-brand-900 text-white"
    >
      <HeroDoodles />

      <div className="relative flex flex-[1_1_460px] flex-col justify-center gap-[18px] px-6 pt-10 pb-4 sm:px-10 md:pt-14 md:pr-6 md:pb-[72px] md:pl-14">
        <h1 id={titleId} className="text-[40px] leading-[1.05] font-extrabold tracking-[-1.5px] sm:text-[56px]">
          {firstWord} <span className="text-lime">{rest.join(" ")}</span>
        </h1>
        <p className="max-w-[470px] text-base leading-[1.6] text-brand-100 sm:text-lg">{t("restaurantHome.hero.text")}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link
            to="/search"
            className="inline-flex h-[50px] items-center gap-2 rounded-full bg-lime px-[26px] text-base font-extrabold text-brand-900 transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
          >
            {t("restaurantHome.hero.shopNow")}
            <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" />
          </Link>
          {/* The live tracking page does not exist yet. */}
          <button
            type="button"
            onClick={() => toast(t("restaurantHome.hero.comingSoon"))}
            className="inline-flex h-[50px] cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-lime bg-transparent px-6 text-base font-bold text-white transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
          >
            <ScooterIcon className="h-5 w-5" />
            {t("restaurantHome.hero.trackDelivery")}
          </button>
        </div>
      </div>

      <div className="relative flex min-h-[300px] flex-[1_1_380px] items-end justify-center px-6 sm:min-h-[360px] sm:px-0">
        <SpeechBubble />
        <ChefIllustration label={t("restaurantHome.hero.chef")} />
      </div>

      {statsFailed ? <div className="basis-full pb-12" /> : <HeroStats impact={impact} />}

      <svg
        viewBox="0 0 1100 48"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-px block h-12 w-full"
      >
        <path d="M0 48V26C300 -4 800 -4 1100 26V48z" className="fill-neutral-50" />
      </svg>
    </section>
  );
}

export default HomeHero;
