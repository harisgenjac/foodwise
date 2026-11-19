import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, Truck } from "lucide-react";
import { formatMoney } from "../../utils/orders.js";
import { formatClock } from "../../utils/delivery.js";
import type { CartDelivery } from "../../types/index.js";

interface DeliverySummaryProps {
  delivery: CartDelivery | null;
  loading: boolean;
  failed: boolean;
  // What the goods cost, so the restaurant sees what it pays the courier.
  goodsTotal: number;
}

// The delivery choice at checkout: the provider's estimated price and arrival, what the courier
// collects in cash, or why delivery is not possible now (with a link when the restaurant can fix it).
function DeliverySummary({ delivery, loading, failed, goodsTotal }: DeliverySummaryProps) {
  const { t } = useTranslation();

  if (loading && !delivery) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-neutral-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("cart.delivery.checking")}
      </p>
    );
  }
  if (failed && !delivery) {
    return <p className="rounded-xl bg-danger-50 p-3 text-sm text-danger-700">{t("cart.delivery.error")}</p>;
  }
  if (!delivery) return null;

  if (!delivery.available) {
    return (
      <div data-testid="delivery-unavailable" className="flex gap-2 rounded-xl bg-warning-50 p-3 text-sm text-warning-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p>{t(`cart.delivery.reasons.${delivery.reason ?? "UNAVAILABLE"}`)}</p>
          {delivery.reason === "RESTAURANT_NO_LOCATION" && (
            <Link to="/my-profile#location" className="mt-1 inline-block font-semibold underline">
              {t("location.reminderLink")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  const price = Number(delivery.price ?? 0);
  return (
    <div data-testid="delivery-estimate" className="space-y-2 rounded-xl bg-brand-50/60 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-neutral-900">
        <Truck className="h-4 w-4 text-brand-800" aria-hidden="true" />
        {t("cart.delivery.arrives", { time: formatClock(delivery.estimated_delivery_at ?? "") })}
      </p>
      <dl className="space-y-1 text-neutral-700">
        <div className="flex justify-between gap-2">
          <dt>{t("cart.delivery.price")}</dt>
          <dd className="font-medium">{formatMoney(price)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>{t("cart.delivery.cash")}</dt>
          <dd className="font-semibold text-neutral-900">{formatMoney(goodsTotal + price)}</dd>
        </div>
      </dl>
      <p className="text-xs text-neutral-500">{t("cart.delivery.estimateHint")}</p>
    </div>
  );
}

export default DeliverySummary;
