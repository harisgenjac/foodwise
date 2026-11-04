import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";

// Explains when auto-renew sends the next request. Shown on hover and on keyboard focus; hidden it
// takes no room (display: none), so it never makes a phone page wider. `endOnPhones`: the icon sits at
// the right edge of a phone card, so below md the tooltip ends at the icon instead of centring on it.
function AutoRenewTooltip({ endOnPhones = false }: { endOnPhones?: boolean }) {
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
        className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-gray-900 px-3 py-2 text-xs leading-snug text-white shadow-lg group-hover:block group-focus-within:block ${
          endOnPhones ? "right-0 md:right-auto md:left-1/2 md:-translate-x-1/2" : "left-1/2 -translate-x-1/2"
        }`}
      >
        {text}
      </span>
    </span>
  );
}

export default AutoRenewTooltip;
