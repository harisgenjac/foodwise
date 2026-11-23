import { useTranslation } from "react-i18next";
import { Clock, PauseCircle } from "lucide-react";
import { formatPauseEnd, isPaused } from "../../utils/orderPause.js";
import { openStateText, type OpenState } from "../../utils/storeHours.js";
import type { StorePause } from "../../types/index.js";

const chip = "inline-flex h-6 max-w-full min-w-0 items-center gap-[5px] rounded-full px-2.5 text-xs font-bold";

// Why a store takes no orders right now, as chips in a store's header (Search and the restaurant
// home, design/search/search.html): "Narudžbe pauzirane do 14:30" in orange while it has paused
// orders, "Zatvoreno · otvara u 08:00" in grey while it is closed by its weekly hours. Nothing for
// an open store or one without hours.
function StoreAvailabilityChip({ pause, state }: { pause: Partial<StorePause>; state: OpenState | null }) {
  const { t } = useTranslation();
  const paused = isPaused(pause);
  const closed = state !== null && !state.open;
  return (
    <>
      {paused && (
        <span data-testid="store-paused-chip" className={`${chip} bg-accent-100 text-accent-700`}>
          <PauseCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("storePage.paused", { until: formatPauseEnd(pause.orders_paused_until ?? null, t) })}</span>
        </span>
      )}
      {closed && (
        <span data-testid="store-closed-chip" className={`${chip} bg-neutral-100 text-neutral-700`}>
          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{openStateText(state, t)}</span>
        </span>
      )}
    </>
  );
}

export default StoreAvailabilityChip;
