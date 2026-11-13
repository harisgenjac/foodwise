import { useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, Send } from "lucide-react";
import api from "../../api/axios.js";
import FormField, { inputStyle } from "../form/FormField.js";
import DateInput from "../form/DateInput.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import { formatDisplayDate, formatTimeTyping, parseTimeInput, toDateInput } from "../../utils/expiry.js";
import { formatMoney } from "../../utils/orders.js";
import type { Cart, SendChange, SendChangeKind } from "../../types/index.js";

// What POST /orders answered: the order (with its items) and what sending changed.
export interface SentOrderResult {
  order: { id: number; code: string; pickup_at: string; items: { quantity: string; unit_price: string }[] };
  changes: SendChange[];
}

// A line the server would not send (409 ORDER_NOT_SENT).
export interface NotSentLine {
  product_id: number;
  kind: SendChangeKind;
}

interface CheckoutPanelProps {
  cart: Cart;
  onSent: (result: SentOrderResult) => void;
  onNotSent: (lines: NotSentLine[]) => void;
}

// The cart's checkout: the pickup day and time (today up to the earliest expiry among the lines
// that can be ordered), "Accept partial fulfilment" and sending. Every available line goes with
// the price the restaurant saw; the server sends what it can (docs/orders-design.md, section 5).
function CheckoutPanel({ cart, onSent, onNotSent }: CheckoutPanelProps) {
  const { t } = useTranslation();
  // YYYY-MM-DD, and the time text (masked as HH:MM while typing, completed on blur).
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [acceptPartial, setAcceptPartial] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const orderable = cart.items.filter((line) => !line.flags.unavailable);
  const minPickup = toDateInput(new Date());
  const maxPickup = orderable.map((line) => line.expiry_date.slice(0, 10)).sort()[0] ?? minPickup;
  const parsedTime = parseTimeInput(pickupTime);
  const { formRef, errorFor, blur, validate } = useFormValidation({
    // A typed date skips the calendar's min/max, so the range is checked here too.
    pickupDate: !pickupDate
      ? REQUIRED
      : pickupDate < minPickup || pickupDate > maxPickup
        ? "myReservations.pickupDateOutOfRange"
        : undefined,
    pickupTime: isBlank(pickupTime) ? REQUIRED : parsedTime ? undefined : "myReservations.invalidTime",
  });
  // The limit is shown once it is close (design: from 8 of 10 on).
  const showPending = cart.pending_orders >= cart.max_pending_orders - 2;

  const normalizeTime = () => {
    if (parsedTime && parsedTime !== pickupTime) setPickupTime(parsedTime);
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || orderable.length === 0 || !validate()) return;
    setSubmitting(true);
    try {
      const response = await api.post("/orders", {
        // Local time without a time zone, as the server expects.
        pickup_at: `${pickupDate}T${parsedTime}`,
        accept_partial: acceptPartial,
        items: orderable.map((line) => ({
          product_id: line.product_id,
          quantity: Number(line.quantity),
          unit_price: line.unit_price_seen,
        })),
      });
      onSent({ order: response.data.order, changes: response.data.changes });
    } catch (err) {
      console.error(err);
      const data = axios.isAxiosError(err) ? err.response?.data : null;
      if (data?.code === "ORDER_NOT_SENT") {
        onNotSent(data.lines ?? []);
      } else {
        toast.error(data?.error || t("cart.checkout.sendError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      aria-labelledby="checkout-title"
      className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
    >
      <h2 id="checkout-title" className="text-lg font-bold text-gray-900">
        {t("cart.checkout.title")}
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <DateInput
          label={t("myReservations.pickupDate")}
          value={pickupDate}
          onChange={setPickupDate}
          min={minPickup}
          max={maxPickup}
          required
          error={errorFor("pickupDate")}
          onBlur={blur("pickupDate")}
        />
        <FormField label={t("myReservations.pickupTime")} icon={Clock} required error={errorFor("pickupTime")}>
          <input
            type="text"
            inputMode="numeric"
            placeholder={t("myReservations.timePlaceholder")}
            maxLength={5}
            value={pickupTime}
            onChange={(e) => setPickupTime(formatTimeTyping(e.target.value, pickupTime))}
            onBlur={() => {
              normalizeTime();
              blur("pickupTime")();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                normalizeTime();
              }
            }}
            className={inputStyle}
          />
        </FormField>
      </div>
      {orderable.length > 0 && (
        <p className="text-xs text-gray-500">{t("cart.checkout.pickupUntil", { date: formatDisplayDate(maxPickup) })}</p>
      )}

      <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={acceptPartial}
          onChange={(e) => setAcceptPartial(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-orange-500"
        />
        {t("orders.send.acceptPartial")}
      </label>

      <div className="flex items-baseline justify-between border-t border-gray-100 pt-4">
        <span className="text-sm text-gray-600">{t("cart.checkout.total")}</span>
        <span className="text-xl font-bold text-gray-900">{formatMoney(cart.totals.total)}</span>
      </div>

      {showPending && (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("cart.checkout.pending", { pending: cart.pending_orders, max: cart.max_pending_orders })}
        </p>
      )}
      {orderable.length === 0 && <p className="text-sm text-gray-600">{t("cart.checkout.nothingToSend")}</p>}

      <button
        type="submit"
        disabled={submitting || orderable.length === 0}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Send className="h-4 w-4" />
        {t("orders.send.submit")}
      </button>
    </form>
  );
}

export default CheckoutPanel;
