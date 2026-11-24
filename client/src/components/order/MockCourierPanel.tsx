import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ExternalLink, FlaskConical } from "lucide-react";
import api, { apiErrorMessage } from "../../api/axios.js";
import type { DeliveryFailureCode, DeliveryStatus, OrderDelivery } from "../../types/index.js";

type CourierStep = "courier_assigned" | "picked_up" | "delivered" | "cancelled";

// The courier's next possible steps per delivery status (the mock's order). Moving the arrival and
// failing are possible in every open status.
const NEXT_STEPS: Partial<Record<DeliveryStatus, CourierStep[]>> = {
  CREATED: ["courier_assigned", "cancelled"],
  COURIER_ASSIGNED: ["picked_up", "cancelled"],
  PICKED_UP: ["delivered"],
};

// The delivery service's failure codes (CANCELLED_BY_SERVICE is also the "Služba otkazala" step).
const FAILURE_CODES: DeliveryFailureCode[] = ["NO_COURIER", "OUT_OF_ZONE", "CANCELLED_BY_SERVICE", "RECIPIENT_CLOSED", "OTHER"];

const BUTTON =
  "cursor-pointer rounded-lg border border-info-200 bg-white px-3 py-1.5 text-sm font-medium text-info-800 transition-colors hover:bg-info-100 disabled:cursor-not-allowed disabled:opacity-60";

interface MockCourierPanelProps {
  orderId: number;
  delivery: OrderDelivery;
  onDone: () => void;
}

// Development tools only (the order page renders it under DEV_TOOLS, utils/devTools.ts): plays the mock
// provider's courier through POST /delivery/mock/orders/:id/simulate, which sends the signed
// webhook the real provider would: assigning a random courier (with a photo or without), the
// pickup, the delivery, moving the arrival estimate by 5 minutes either way, failing with each of
// the service's failure codes (before or after the pickup) and a cancel by the service. It links to
// the mock's tracking page (the delivery's tracking_url) once a courier is assigned.
function MockCourierPanel({ orderId, delivery, onDone }: MockCourierPanelProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [withPhoto, setWithPhoto] = useState(true);
  const [failureCode, setFailureCode] = useState<DeliveryFailureCode>("NO_COURIER");
  const steps = NEXT_STEPS[delivery.status];
  const open = steps !== undefined && Boolean(delivery.price);
  if (!open && !delivery.tracking_url) return null;

  const simulate = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await api.post(`/delivery/mock/orders/${orderId}/simulate`, body);
      toast.success(response.data.message);
      onDone();
    } catch (err) {
      console.error(err);
      const message = apiErrorMessage(err);
      toast.error(message || t("orders.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const pickedUp = delivery.status === "PICKED_UP";

  return (
    <section data-testid="mock-courier" className="space-y-3 rounded-2xl border border-dashed border-info-300 bg-info-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-info-800">
        <FlaskConical className="h-4 w-4" />
        {t("orders.mockCourier.title")}
      </p>
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {steps.map((step) => (
              <button
                key={step}
                type="button"
                disabled={busy}
                onClick={() => simulate(step === "courier_assigned" ? { event: step, photo: withPhoto } : { event: step })}
                className={BUTTON}
              >
                {t(`orders.mockCourier.steps.${step}`)}
              </button>
            ))}
            {delivery.status === "CREATED" && (
              <label className="flex items-center gap-1.5 text-sm text-info-800">
                <input
                  type="checkbox"
                  checked={withPhoto}
                  onChange={(event) => setWithPhoto(event.target.checked)}
                  className="h-4 w-4 accent-info-700"
                />
                {t("orders.mockCourier.withPhoto")}
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => simulate({ event: "estimate", minutes: 5 })} className={BUTTON}>
              {t("orders.mockCourier.steps.estimate_later")}
            </button>
            <button type="button" disabled={busy} onClick={() => simulate({ event: "estimate", minutes: -5 })} className={BUTTON}>
              {t("orders.mockCourier.steps.estimate_earlier")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 max-w-full items-center gap-1.5 text-sm text-info-800">
              {t("orders.mockCourier.failureCode")}
              <select
                value={failureCode}
                onChange={(event) => setFailureCode(event.target.value as DeliveryFailureCode)}
                className="min-w-0 max-w-full rounded-lg border border-info-200 bg-white px-2 py-1.5 text-sm text-neutral-900"
              >
                {FAILURE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {t(`orders.delivery.failure.${code}`)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => simulate({ event: "failed", failure_code: failureCode })}
              className={BUTTON}
            >
              {t(pickedUp ? "orders.mockCourier.failAfter" : "orders.mockCourier.failBefore")}
            </button>
          </div>
        </>
      )}
      {delivery.tracking_url && (
        <a
          href={delivery.tracking_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-info-800 underline-offset-2 hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          {t("orders.mockCourier.tracking")}
        </a>
      )}
    </section>
  );
}

export default MockCourierPanel;
