import { useTranslation } from "react-i18next";
import { Cloud, Coins, Salad, type LucideIcon } from "lucide-react";
import InfoTooltip from "../common/InfoTooltip.js";
import { formatNumber } from "../../utils/numbers.js";
import type { RestaurantImpact } from "../../types/index.js";

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

interface ImpactStripProps {
  // null while loading: the strip keeps its height with placeholder numbers.
  impact: RestaurantImpact | null;
}

// The teal band under RestaurantHero (design/restaurant-home/impact-strip.html): food saved, CO₂
// avoided and money saved, each with an InfoTooltip. A restaurant that has picked up nothing yet
// sees the platform's totals under "Together we have saved".
function ImpactStrip({ impact }: ImpactStripProps) {
  const { t, i18n } = useTranslation();
  const together = impact?.scope === "platform";

  return (
    <section
      aria-label={t("impactStrip.label")}
      aria-busy={!impact}
      data-testid="impact-strip"
      // -mt-px and relative: the strip overlaps the hero by 1 px and paints above it, so no light
      // seam shows where the hero ends on a fraction of a pixel.
      className="relative -mt-px rounded-b-2xl bg-[#0F766E] p-4 sm:px-6 sm:py-[22px]"
    >
      {together && (
        <p className="mb-3 text-sm font-medium text-[#D9F99D] sm:text-center">{t("impactStrip.together")}</p>
      )}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 sm:gap-5">
        {STATS.map(({ key, icon: Icon, value }) => (
          <div key={key} className="relative flex items-center justify-start gap-3.5 sm:justify-center">
            <Icon className="h-8 w-8 shrink-0 text-[#99F6E4] sm:h-10 sm:w-10" strokeWidth={1.5} aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[15px] text-[#F0FDFA]">
                <span>{t(`impactStrip.${key}`)}</span>
                <InfoTooltip
                  icon={Icon}
                  title={t(`impactStrip.${key}`)}
                  text={t(`impactStrip.${key}Tip`)}
                  label={t(`impactStrip.${key}Info`)}
                />
              </div>
              <p className="text-2xl leading-[1.2] font-semibold text-white sm:text-[30px]" data-testid="impact-value">
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
    </section>
  );
}

export default ImpactStrip;
