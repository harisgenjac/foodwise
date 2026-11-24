import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bike, Car, Clock, FlaskConical, Phone, SearchX, Star, Store, Truck, UserRound } from "lucide-react";
import api from "../../api/axios.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import EmptyState from "../../components/product/EmptyState.js";
import DetailItem from "../../components/product/DetailItem.js";
import { useLiveOrderRefresh } from "../../context/LiveEventsContext.js";
import { deliveryFailureKey, formatOrderCode, formatOrderDateTime } from "../../utils/orders.js";
import type { MockTracking } from "../../types/index.js";

const time = (value: string | null) => (value ? formatOrderDateTime(value) : "–");

// Development tools only (App.tsx mounts /dev/tracking/:deliveryId under DEV_TOOLS): the page
// the mock delivery's tracking_url points to, standing in for the delivery service's own tracking
// page. It shows the courier with photo and vehicle, the status, the exact estimates, the history
// of the delivery's events (with the estimates each one carried) and the ratings the service
// received. It reloads when the order changes (live events).
function DevTrackingPage() {
  const { deliveryId } = useParams();
  const { t } = useTranslation();
  const [tracking, setTracking] = useState<MockTracking | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTracking = useCallback(async () => {
    try {
      const response = await api.get(`/delivery/mock/deliveries/${encodeURIComponent(deliveryId ?? "")}`);
      setTracking(response.data);
    } catch (err) {
      console.error("Error fetching the mock delivery:", err);
      setTracking(null);
    } finally {
      setLoading(false);
    }
  }, [deliveryId]);

  useEffect(() => {
    fetchTracking();
  }, [fetchTracking]);

  useLiveOrderRefresh(fetchTracking, tracking?.delivery.order_id);

  if (loading) return <LoadingSpinner />;
  if (!tracking) {
    return (
      <div className="mx-auto max-w-3xl pb-10">
        <EmptyState icon={SearchX} title={t("orders.tracking.notFound")} subtitle={t("orders.tracking.notFoundSubtitle")} />
      </div>
    );
  }

  const { delivery, history, ratings } = tracking;
  const VehicleIcon = delivery.courier_vehicle === "CAR" ? Car : Bike;
  const failed = delivery.status === "FAILED" || delivery.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10" data-testid="dev-tracking">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-info-700">
          <FlaskConical className="h-4 w-4" />
          {t("orders.tracking.devNote")}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">{t("orders.tracking.title")}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {t("orders.tracking.order", { code: formatOrderCode(delivery.order_code) })} ·{" "}
          {t("orders.tracking.route", { store: delivery.store_name ?? "–", restaurant: delivery.restaurant_name ?? "–" })}
        </p>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-xs text-neutral-500">{t("orders.tracking.status")}</p>
        <p className={`text-lg font-bold ${failed ? "text-danger-700" : "text-neutral-900"}`}>
          {t(`orders.delivery.status.${delivery.status}`)}
        </p>
        {failed && (
          <p className="mt-1 text-sm text-danger-700">
            {t("orders.tracking.failure")}:{" "}
            {t(`orders.delivery.failure.${deliveryFailureKey({ ...delivery, price: "0", cash_to_collect: null })}`)}
            {delivery.failure_reason && <span className="text-neutral-500"> ({delivery.failure_reason})</span>}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-1 gap-4 rounded-xl bg-neutral-50 p-4 sm:grid-cols-2">
          <DetailItem icon={Store} label={t("orders.tracking.readyAt")} value={time(delivery.ready_at)} />
          <DetailItem icon={Clock} label={t("orders.tracking.pickupEstimate")} value={time(delivery.estimated_pickup_at)} />
          <DetailItem icon={Truck} label={t("orders.tracking.deliveryEstimate")} value={time(delivery.estimated_delivery_at)} />
          <DetailItem icon={UserRound} label={t("orders.tracking.assignedAt")} value={time(delivery.courier_assigned_at)} />
          <DetailItem icon={Truck} label={t("orders.tracking.pickedUpAt")} value={time(delivery.picked_up_at)} />
          <DetailItem
            icon={failed ? Clock : Truck}
            label={t(failed ? "orders.tracking.failedAt" : "orders.tracking.deliveredAt")}
            value={time(failed ? delivery.failed_at : delivery.delivered_at)}
          />
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">{t("orders.tracking.courier")}</h2>
        {delivery.courier_name ? (
          <div className="mt-3 flex items-center gap-4">
            {delivery.courier_photo_url ? (
              <img
                src={delivery.courier_photo_url}
                alt={delivery.courier_name}
                className="h-16 w-16 rounded-full border border-neutral-200 object-cover"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-800">
                <UserRound className="h-7 w-7" />
              </span>
            )}
            <div className="space-y-1 text-sm">
              <p className="text-base font-semibold text-neutral-900">{delivery.courier_name}</p>
              {delivery.courier_vehicle && (
                <p className="flex items-center gap-1.5 text-neutral-700">
                  <VehicleIcon className="h-4 w-4" />
                  {t(`orders.delivery.vehicles.${delivery.courier_vehicle}`)}
                </p>
              )}
              {delivery.courier_phone && (
                <p className="flex items-center gap-1.5 text-neutral-700">
                  <Phone className="h-4 w-4" />
                  <a href={`tel:${delivery.courier_phone}`} className="hover:underline">
                    {delivery.courier_phone}
                  </a>
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">{t("orders.tracking.noCourier")}</p>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">{t("orders.tracking.history")}</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">{t("orders.tracking.noHistory")}</p>
        ) : (
          <ol className="mt-3 space-y-3" aria-label={t("orders.tracking.history")}>
            {history.map((event) => (
              <li key={event.id} className="border-l-2 border-brand-200 pl-3 text-sm">
                <p className="font-medium text-neutral-900">
                  {t(`orders.tracking.events.${event.type.replace(/^delivery\./, "")}`, { defaultValue: event.type })}
                  {!event.applied && <span className="ml-2 text-xs font-normal text-neutral-500">{t("orders.tracking.ignored")}</span>}
                </p>
                <p className="text-xs text-neutral-500">{formatOrderDateTime(event.occurred_at)}</p>
                {(event.estimated_pickup_at || event.estimated_delivery_at) && (
                  <p className="text-xs text-neutral-600">
                    {t("orders.tracking.estimates", {
                      pickup: time(event.estimated_pickup_at),
                      delivery: time(event.estimated_delivery_at),
                    })}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <Star className="h-4 w-4 text-warning-600" />
          {t("orders.tracking.ratings")}
        </h2>
        {ratings.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">{t("orders.tracking.noRatings")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {ratings.map((rating) => (
              <li key={rating.received_at} className="text-sm">
                <span className="font-semibold text-neutral-900">{rating.rating}/5</span>
                {rating.comment && <span className="text-neutral-700"> · {rating.comment}</span>}
                <span className="block text-xs text-neutral-500">{formatOrderDateTime(rating.received_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default DevTrackingPage;
