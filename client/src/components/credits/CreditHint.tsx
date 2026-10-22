import { useTranslation } from "react-i18next";
import { Coins } from "lucide-react";
import { useCredits } from "../../context/CreditsContext.js";

// "This will use 1 credit (N left)" next to the add-product and reservation buttons;
// `perProduct` for the CSV import, where every row costs one. Hidden without credit data.
function CreditHint({ perProduct = false, className = "" }: { perProduct?: boolean; className?: string }) {
  const { credits } = useCredits();
  const { t } = useTranslation();
  if (!credits) return null;

  const text = !credits.hasActiveSubscription
    ? t("credits.hint.noSubscription")
    : t(perProduct ? "credits.hint.perProduct" : "credits.hint.one", { left: credits.available });

  return (
    <p className={`flex items-center gap-1.5 text-xs text-gray-500 ${className}`}>
      <Coins className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      {text}
    </p>
  );
}

export default CreditHint;
