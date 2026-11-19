import { useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import api, { apiErrorMessage } from "../../api/axios.js";
import type { DeliveryStatus, OrderDelivery } from "../../types/index.js";

type CourierStep = "courier_assigned" | "picked_up" | "delivered" | "failed" | "cancelled";

// The courier's next possible steps per delivery status (the mock's order).
const NEXT_STEPS: Partial<Record<DeliveryStatus, CourierStep[]>> = {
  CREATED: ["courier_assigned", "failed", "cancelled"],
  COURIER_ASSIGNED: ["picked_up", "failed", "cancelled"],
  PICKED_UP: ["delivered", "failed"],
};

interface MockCourierPanelProps {
  orderId: number;
  delivery: OrderDelivery;
  onDone: () => void;
}

// Development only (the order page renders it under import.meta.env.DEV): plays the mock
// provider's courier through POST /delivery/mock/orders/:id/simulate, which sends the signed
// webhook the real provider would.
function MockCourierPanel({ orderId, delivery, onDone }: MockCourierPanelProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const steps = NEXT_STEPS[delivery.status] ?? [];
  if (steps.length === 0 || !delivery.price) return null;

  const simulate = async (event: CourierStep) => {
    setBusy(true);
    try {
      const response = await api.post(`/delivery/mock/orders/${orderId}/simulate`, { event });
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

  return (
    <section data-testid="mock-courier" className="rounded-2xl border border-dashed border-info-300 bg-info-50 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-info-800">
        <FlaskConical className="h-4 w-4" />
        {t("orders.mockCourier.title")}
      </p>
      <div className="flex flex-wrap gap-2">
        {steps.map((step) => (
          <button
            key={step}
            type="button"
            disabled={busy}
            onClick={() => simulate(step)}
            className="cursor-pointer rounded-lg border border-info-200 bg-white px-3 py-1.5 text-sm font-medium text-info-800 transition-colors hover:bg-info-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t(`orders.mockCourier.steps.${step}`)}
          </button>
        ))}
      </div>
    </section>
  );
}

export default MockCourierPanel;
