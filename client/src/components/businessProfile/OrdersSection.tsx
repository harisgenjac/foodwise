import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, PauseCircle, PlayCircle } from "lucide-react";
import PauseOrdersModal from "../profile/PauseOrdersModal.js";
import { Chip, SectionError, Switch } from "./ui.js";
import { formatPauseEnd, isPaused, pauseUntil, PREPARATION_MINUTES } from "../../utils/orderPause.js";
import type { OrderDraft } from "./draft.js";

interface OrdersSectionProps {
  value: OrderDraft;
  onChange: (value: OrderDraft) => void;
  error?: string | undefined;
}

const row = "flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between";

// "Narudžbe i dostava" (stores): receiving orders with the pause (its length is chosen in the
// existing dialog), "Nudim dostavu" and "Vrijeme pripreme". Like the rest of the page, the choices
// are only applied when the page is saved.
function OrdersSection({ value, onChange, error }: OrdersSectionProps) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const paused = isPaused(value);
  const until = formatPauseEnd(value.orders_paused_until, t);

  return (
    <div>
      <SectionError message={error} />
      <div className="divide-y divide-neutral-100">
        <div className={`${row} pt-0`} data-testid="order-pause">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                paused ? "bg-warning-100 text-warning-700" : "bg-brand-50 text-brand-800"
              }`}
            >
              {paused ? <PauseCircle className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-bold text-neutral-900">
                {t("profile.orders.receiving")}
                {paused ? (
                  <Chip tone="warning">{t("profile.orders.pausedChip", { until })}</Chip>
                ) : (
                  <Chip tone="success">{t("profile.orders.active")}</Chip>
                )}
              </p>
              <p className="text-sm text-neutral-600">
                {paused ? t("orderPause.pausedText", { until }) : t("orderPause.receivingText")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => (paused ? onChange({ ...value, orders_paused: false, orders_paused_until: null }) : setAsking(true))}
            className="min-h-11 shrink-0 cursor-pointer rounded-full border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
          >
            {paused ? t("profile.orders.resume") : t("orderPause.pause")}
          </button>
        </div>

        <div className={row}>
          <div>
            <p id="delivery-label" className="font-bold text-neutral-900">
              {t("orderSettings.delivery")}
            </p>
            <p className="text-sm text-neutral-600">
              {value.delivery_enabled ? t("orderSettings.deliveryOnHint") : t("orderSettings.deliveryOffHint")}
            </p>
          </div>
          <Switch
            checked={value.delivery_enabled}
            onChange={(delivery_enabled) => onChange({ ...value, delivery_enabled })}
            label={t("orderSettings.delivery")}
            testId="delivery-switch"
          />
        </div>

        <div className={`${row} pb-0`}>
          <div>
            <label htmlFor="preparation-minutes" className="font-bold text-neutral-900">
              {t("orderSettings.preparation")}
            </label>
            <p className="text-sm text-neutral-600">{t("orderSettings.preparationHint")}</p>
          </div>
          <span className="relative block shrink-0 sm:w-48">
            <Clock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
            <select
              id="preparation-minutes"
              value={value.preparation_minutes}
              onChange={(e) => onChange({ ...value, preparation_minutes: Number(e.target.value) })}
              className="min-h-11 w-full cursor-pointer rounded-xl border border-neutral-200 bg-white py-2 pr-3 pl-9 text-base text-neutral-900 focus:border-brand-800 focus:ring-4 focus:ring-brand-100 focus:outline-none sm:text-sm"
            >
              {PREPARATION_MINUTES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t("orderSettings.minutes", { count: minutes })}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      {asking && (
        <PauseOrdersModal
          busy={false}
          onConfirm={(option) => {
            onChange({ ...value, orders_paused: true, orders_paused_until: pauseUntil(option) });
            setAsking(false);
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}

export default OrdersSection;
