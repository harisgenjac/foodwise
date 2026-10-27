import { useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { Clock, Scale } from "lucide-react";
import api from "../../api/axios.js";
import Modal from "./Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import DateInput from "../form/DateInput.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import { formatTimeTyping, parseTimeInput, toDateInput } from "../../utils/expiry.js";
import type { Product } from "../../types/index.js";
import InsufficientCreditsNotice from "../credits/InsufficientCreditsNotice.js";
import CreditHint from "../credits/CreditHint.js";
import { getCreditError, type CreditError } from "../../utils/credits.js";
import { translateServerMessage } from "../../i18n/serverMessages.js";

// The axios interceptor has already translated `error`, so it is compared with the translated text.
const NOT_ENOUGH_AVAILABLE = "Not enough product available.";

interface ReserveProductModalProps {
  product: Product;
  // Shown under the name; defaults to the product's store and city.
  storeLine?: string;
  onClose: () => void;
  // Called after a successful reservation (the modal has already closed).
  onReserved: () => void;
}

// Reservation form used by BrowseProducts, ProductDetails and StoreDetails.
function ReserveProductModal({ product, storeLine, onClose, onReserved }: ReserveProductModalProps) {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState("");
  // YYYY-MM-DD, and the time text (masked as HH:MM while typing, completed on blur).
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [creditError, setCreditError] = useState<CreditError | null>(null);
  // Refreshed after the server refuses a quantity that is no longer available.
  const [available, setAvailable] = useState(product.available_quantity ?? product.quantity);
  // The server accepts a pickup from today up to the end of the expiry day. A typed date skips the
  // calendar's min/max, so the range is checked here too.
  const minPickup = toDateInput(new Date());
  const maxPickup = product.expiry_date.slice(0, 10);
  const parsedTime = parseTimeInput(pickupTime);
  const { formRef, errorFor, blur, validate } = useFormValidation({
    pickupDate: !pickupDate
      ? REQUIRED
      : pickupDate < minPickup || pickupDate > maxPickup
        ? "myReservations.pickupDateOutOfRange"
        : undefined,
    pickupTime: isBlank(pickupTime) ? REQUIRED : parsedTime ? undefined : "myReservations.invalidTime",
    quantity: isBlank(quantity) ? REQUIRED : undefined,
  });
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const unit = units[product.unit] || product.unit;
  const subtitle = storeLine ?? [product.business_name, product.city].filter(Boolean).join(" · ");

  // Shows a valid time as HH:MM; invalid text stays as typed, with its error.
  const normalizeTime = () => {
    if (parsedTime && parsedTime !== pickupTime) setPickupTime(parsedTime);
  };

  // Puts what is left into the field, so the next submit sends it. Sold out changes nothing.
  const refreshAvailable = async () => {
    try {
      const response = await api.get(`/products/${product.id}`);
      const amount: string = response.data.product.available_quantity ?? response.data.product.quantity;
      if (!(parseFloat(amount) > 0)) return;
      setAvailable(amount);
      setQuantity(String(parseFloat(amount)));
    } catch (err) {
      console.error("Error fetching product:", err);
    }
  };

  const handleReservation = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      await api.post("/reservations", {
        product_id: product.id,
        quantity,
        // Local time without a time zone, as the server expects.
        pickup_date: `${pickupDate}T${parsedTime}`,
      });
      toast.success(t("myProducts.reservationCreated"));
      onClose();
      onReserved();
    } catch (err) {
      // No credits: explain it inside the dialog, with the way to get credits.
      const credits = getCreditError(err);
      if (credits) {
        setCreditError(credits);
        return;
      }
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("reservations.actionError"));
      if (message === translateServerMessage(NOT_ENOUGH_AVAILABLE)) await refreshAvailable();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="mb-4 text-lg font-bold text-gray-900">
        {t("myReservations.reservePopupTitle")}
      </h3>

      <div className="mb-5 flex items-center gap-3 rounded-xl bg-gray-50 p-3">
        <img
          src={CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.Other}
          alt={product.name}
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">{product.name}</p>
          {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
          <p className="mt-0.5 text-sm">
            <span className="font-semibold text-green-600">{product.discounted_price} KM</span>
            <span className="text-gray-400"> · </span>
            <span className="text-gray-600">
              {t("product.available")}: {parseFloat(available)} {unit}
            </span>
          </p>
        </div>
      </div>

      <form ref={formRef} noValidate onSubmit={handleReservation}>
        <div className="space-y-4">
          {/* First, so the calendar opening under the date does not cover the buttons. */}
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
          <FormField label={t("dashboard.quantity")} icon={Scale} suffix={unit} required error={errorFor("quantity")}>
            <input
              type="number"
              min="0.01"
              step="any"
              max={available}
              placeholder={`${t("myReservations.placeholderMax")}: ${parseFloat(available)}`}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onBlur={blur("quantity")}
              className={`${inputStyle} pr-14`}
            />
          </FormField>
          <RequiredHint />
        </div>

        {creditError ? (
          <InsufficientCreditsNotice error={creditError} className="mt-4" />
        ) : (
          <CreditHint className="mt-4" />
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {t("myReservations.cancelButton")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 cursor-pointer rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"
          >
            {t("myReservations.confirmButton")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default ReserveProductModal;
