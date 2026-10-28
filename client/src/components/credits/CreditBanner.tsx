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
// or 80% used (how many are left, link to the Credits page). Nothing otherwise. While a request
// that would fix it already waits for an admin, the banner says so instead of asking again.
// A branch's plan is chosen by its headquarters: without one the banner only says so (nothing to
// buy), and the top-up links ask the headquarters for extra credits.
function CreditBanner() {
  const { credits } = useCredits();
  const { t } = useTranslation();
  if (!credits) return null;

  const waiting = (type: "SUBSCRIPTION" | "TOPUP") =>
    credits.pendingRequests.some(
      (request) => request.request_type === type && request.period_month === credits.periodStart,
    );

  const managed = credits.managedByCompany;
  const company = credits.companyName ?? "";
  const topupLink = managed ? t("credits.banner.companyTopupLink") : t("credits.banner.emptyLink");
  let banner: { tone: keyof typeof TONES; text: string; to: string | null; link: string } | null = null;
  if (!credits.hasActiveSubscription && managed) {
    banner = { tone: "amber", text: t("credits.banner.companyNone", { company }), to: null, link: "" };
  } else if (!credits.hasActiveSubscription) {
    banner = waiting("SUBSCRIPTION")
      ? {
          tone: "amber",
          text: t("credits.banner.pending"),
          to: `/my-profile#${SUBSCRIPTION_SECTION}`,
          link: t("credits.banner.pendingLink"),
        }
      : {
          tone: "amber",
          text: t("credits.banner.none"),
          to: `/my-profile#${SUBSCRIPTION_SECTION}`,
          link: t("credits.banner.noneLink"),
        };
  } else if (credits.available === 0) {
    banner = waiting("TOPUP")
      ? {
          tone: "amber",
          text: managed ? t("credits.banner.companyTopupPending", { company }) : t("credits.banner.topupPending"),
          to: `/my-profile#${TOPUP_SECTION}`,
          link: t("credits.banner.pendingLink"),
        }
      : {
          tone: "red",
          text: t(managed ? "credits.banner.companyEmpty" : "credits.banner.empty"),
          to: `/my-profile#${TOPUP_SECTION}`,
          link: topupLink,
        };
  } else if (usagePercent(credits.used, credits.total) >= LOW_CREDITS_PERCENT) {
    banner = managed && !waiting("TOPUP")
      ? {
          tone: "amber",
          text: t("credits.banner.low", { count: credits.available }),
          to: `/my-profile#${TOPUP_SECTION}`,
          link: topupLink,
        }
      : {
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
      {banner.to && (
        <Link to={banner.to} className="inline-flex shrink-0 items-center gap-1 font-semibold text-orange-600 hover:text-orange-700">
          {banner.link}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

export default CreditBanner;
