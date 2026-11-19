import { useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, Store, XCircle } from "lucide-react";
import api, { apiErrorMessage } from "../../api/axios.js";
import ConfirmModal from "../common/ConfirmModal.js";
import DateInput from "../form/DateInput.js";
import FormField, { inputStyle } from "../form/FormField.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import { formatDisplayDate, formatTimeTyping, parseTimeInput, toDateInput } from "../../utils/expiry.js";
import { formatOrderCode } from "../../utils/orders.js";
import type { OrderDetails } from "../../types/index.js";

interface DeliveryFailedActionsProps {
  order: OrderDetails;
  onDone: () => void;
}

type Pending = "pickup" | "cancel" | null;

// After a failed delivery (deliveryFailedBeforePickup) the restaurant chooses: pick the order up
// at the store at a time it sets (today up to the earliest expiry of the accepted products, as when
// sending), or cancel it.
function DeliveryFailedActions({ order, onDone }: DeliveryFailedActionsProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");

  const minPickup = toDateInput(new Date());
  const maxPickup =
    order.items
      .filter((item) => item.status === "Confirmed" && item.expiry_date)
      .map((item) => item.expiry_date!.slice(0, 10))
      .sort()[0] ?? minPickup;
  const parsedTime = parseTimeInput(pickupTime);
  // A typed date skips the calendar's min/max, so the range is checked here too.
  const { errorFor, blur, validate, reset } = useFormValidation({
    pickupDate: !pickupDate
      ? REQUIRED
      : pickupDate < minPickup || pickupDate > maxPickup
        ? "orderForm.pickupDateOutOfRange"
        : undefined,
    pickupTime: isBlank(pickupTime) ? REQUIRED : parsedTime ? undefined : "orderForm.invalidTime",
  });

  const run = async (path: string, body?: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await api.post(`/orders/${order.id}/${path}`, body);
      toast.success(response.data.message);
      setPending(null);
      onDone();
    } catch (err) {
      console.error(err);
      const message = apiErrorMessage(err);
      toast.error(message || t("orders.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const switchToPickup = () => {
    if (!validate()) return;
    run("switch-to-pickup", { pickup_at: `${pickupDate}T${parsedTime}` });
  };

  const close = () => {
    setPending(null);
    reset();
  };

  const code = formatOrderCode(order.code);
  const store = order.store.business_name ?? "";

  return (
    <div data-testid="delivery-failed" className="space-y-3 rounded-xl border border-warning-200 bg-warning-50 p-4">
      <p className="flex items-start gap-2 text-sm text-warning-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {t("orders.deliveryFailed.prompt", { store })}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => setPending("pickup")}
          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand-800 py-2.5 font-semibold text-white shadow-sm shadow-brand-800/20 transition-colors hover:bg-brand-900"
        >
          <Store className="h-4 w-4" />
          {t("orders.deliveryFailed.pickupButton")}
        </button>
        <button
          type="button"
          onClick={() => setPending("cancel")}
          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-2.5 font-semibold text-neutral-700 transition-colors hover:border-danger-200 hover:bg-danger-50 hover:text-danger-700"
        >
          <XCircle className="h-4 w-4" />
          {t("orders.cancelButton")}
        </button>
      </div>

      {pending === "pickup" && (
        <ConfirmModal
          variant="success"
          icon={Store}
          title={t("orders.deliveryFailed.pickupTitle")}
          message={t("orders.deliveryFailed.pickupText", { code, store })}
          confirmLabel={t("orders.deliveryFailed.pickupConfirm")}
          cancelLabel={t("orders.keepButton")}
          busy={busy}
          onConfirm={switchToPickup}
          onClose={close}
        >
          <div className="grid grid-cols-2 gap-3">
            <DateInput
              label={t("orderForm.pickupDate")}
              value={pickupDate}
              onChange={setPickupDate}
              min={minPickup}
              max={maxPickup}
              required
              error={errorFor("pickupDate")}
              onBlur={blur("pickupDate")}
            />
            <FormField label={t("orderForm.pickupTime")} icon={Clock} required error={errorFor("pickupTime")}>
              <input
                type="text"
                inputMode="numeric"
                placeholder={t("orderForm.timePlaceholder")}
                maxLength={5}
                value={pickupTime}
                onChange={(e) => setPickupTime(formatTimeTyping(e.target.value, pickupTime))}
                onBlur={() => {
                  if (parsedTime) setPickupTime(parsedTime);
                  blur("pickupTime")();
                }}
                className={inputStyle}
              />
            </FormField>
          </div>
          <p className="mt-2 text-xs text-neutral-500">{t("cart.checkout.pickupUntil", { date: formatDisplayDate(maxPickup) })}</p>
        </ConfirmModal>
      )}

      {pending === "cancel" && (
        <ConfirmModal
          variant="danger"
          icon={XCircle}
          title={t("orders.cancelConfirmation")}
          message={t("orders.deliveryFailed.cancelText", { code, store })}
          confirmLabel={t("orders.cancelButton")}
          cancelLabel={t("orders.keepButton")}
          busy={busy}
          onConfirm={() => run("cancel-failed-delivery")}
          onClose={close}
        />
      )}
    </div>
  );
}

export default DeliveryFailedActions;
