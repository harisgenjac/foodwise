import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";

// Explains when auto-renew sends the next request. Shown on hover and on keyboard focus.
function AutoRenewTooltip() {
  const { t } = useTranslation();
  const text = t("credits.profile.autoRenewTooltip");
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={text}
        className="cursor-help rounded-full p-0.5 text-gray-400 transition-colors hover:text-gray-600 focus:text-gray-600 focus:outline-none"
      >
        <Info className="h-4 w-4" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export default AutoRenewTooltip;
