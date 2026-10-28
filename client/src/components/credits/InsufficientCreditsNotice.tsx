import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Coins } from "lucide-react";
import { useCredits } from "../../context/CreditsContext.js";
import type { CreditError } from "../../utils/credits.js";

// Shown instead of a plain error when the server answers 402 INSUFFICIENT_CREDITS: explains why
// and links to the subscription or the top-up section, as the server's actionUrl says. A branch
// cannot buy: without a plan it waits for its headquarters (no link), without credits it asks the
// headquarters for a top-up.
function InsufficientCreditsNotice({ error, className = "" }: { error: CreditError; className?: string }) {
  const { t } = useTranslation();
  const { credits } = useCredits();
  const company = credits?.managedByCompany ? (credits.companyName ?? "") : null;
  if (company !== null) {
    return (
      <div role="alert" className={`flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm ${className}`}>
        <Coins className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold text-amber-900">{t("credits.insufficient.title")}</p>
          <p className="mt-0.5 text-amber-800">
            {error.hasActiveSubscription
              ? t("credits.insufficient.noCredits")
              : t("credits.insufficient.noCompanyPlan", { company })}
          </p>
          {error.hasActiveSubscription && (
            <Link
              to={error.actionUrl}
              className="mt-2 inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700"
            >
              {t("credits.insufficient.companyTopupLink")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div role="alert" className={`flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm ${className}`}>
      <Coins className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div>
        <p className="font-semibold text-amber-900">{t("credits.insufficient.title")}</p>
        <p className="mt-0.5 text-amber-800">
          {error.hasActiveSubscription ? t("credits.insufficient.noCredits") : t("credits.insufficient.noSubscription")}
        </p>
        <Link
          to={error.actionUrl}
          className="mt-2 inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700"
        >
          {error.hasActiveSubscription ? t("credits.insufficient.topUpLink") : t("credits.insufficient.subscribeLink")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export default InsufficientCreditsNotice;
