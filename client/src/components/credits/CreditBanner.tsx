import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Coins } from "lucide-react";
import { useCredits } from "../../context/CreditsContext.js";
import { LOW_CREDITS_PERCENT, SUBSCRIPTION_SECTION, TOPUP_SECTION, usagePercent } from "../../utils/credits.js";

const TONES = {
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  red: "border-red-200 bg-red-50 text-red-900",
};

// One credit banner on every page for stores and restaurants, the most urgent one first:
// no subscription (link to the subscription section), no credits left (link to the top-up),
// or 80% used (how many are left, link to the Credits page). Nothing otherwise.
function CreditBanner() {
  const { credits } = useCredits();
  const { t } = useTranslation();
  if (!credits) return null;

  let banner: { tone: keyof typeof TONES; text: string; to: string; link: string } | null = null;
  if (!credits.hasActiveSubscription) {
    banner = {
      tone: "amber",
      text: t("credits.banner.none"),
      to: `/my-profile#${SUBSCRIPTION_SECTION}`,
      link: t("credits.banner.noneLink"),
    };
  } else if (credits.available === 0) {
    banner = {
      tone: "red",
      text: t("credits.banner.empty"),
      to: `/my-profile#${TOPUP_SECTION}`,
      link: t("credits.banner.emptyLink"),
    };
  } else if (usagePercent(credits.used, credits.total) >= LOW_CREDITS_PERCENT) {
    banner = {
      tone: "amber",
      text: t("credits.banner.low", { count: credits.available }),
      to: "/credits",
      link: t("credits.banner.lowLink"),
    };
  }
  if (!banner) return null;

  return (
    <div
      role="status"
      className={`mx-auto mb-6 flex max-w-5xl flex-col gap-2 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${TONES[banner.tone]}`}
    >
      <p className="flex items-center gap-2 font-medium">
        <Coins className="h-4 w-4 shrink-0" />
        {banner.text}
      </p>
      <Link to={banner.to} className="inline-flex shrink-0 items-center gap-1 font-semibold text-orange-600 hover:text-orange-700">
        {banner.link}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export default CreditBanner;
