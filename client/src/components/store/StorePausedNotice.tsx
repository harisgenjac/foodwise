import { useTranslation } from "react-i18next";
import { PauseCircle } from "lucide-react";
import type { StorePause } from "../../types/index.js";
import { formatPauseEnd, isPaused } from "../../utils/orderPause.js";

interface StorePausedNoticeProps {
  pause: Partial<StorePause> | null | undefined;
  // "badge": a small label for store headers and cards; "notice": a line with the end time.
  variant?: "badge" | "notice";
  className?: string;
}

// What a restaurant sees while a store has paused new orders: its products stay on offer and in
// the cart, but nothing can be sent until the pause ends. Nothing without a pause.
function StorePausedNotice({ pause, variant = "notice", className = "" }: StorePausedNoticeProps) {
  const { t } = useTranslation();
  if (!isPaused(pause)) return null;

  if (variant === "badge") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-800 ${className}`}
      >
        <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {t("orderPause.badge")}
      </span>
    );
  }
  return (
    <p
      role="status"
      className={`flex gap-2 rounded-xl bg-warning-50 p-3 text-sm text-warning-800 ${className}`}
    >
      <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {t("orderPause.notice", { until: formatPauseEnd(pause?.orders_paused_until ?? null, t) })}
      </span>
    </p>
  );
}

export default StorePausedNotice;
