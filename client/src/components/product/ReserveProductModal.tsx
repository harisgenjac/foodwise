import { useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { CalendarClock, Scale } from "lucide-react";
import api from "../../api/axios.js";
import Modal from "./Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import { toDateInput } from "../../utils/expiry.js";
import type { Product } from "../../types/index.js";
import InsufficientCreditsNotice from "../credits/InsufficientCreditsNotice.js";
import CreditHint from "../credits/CreditHint.js";
import { getCreditError, type CreditError } from "../../utils/credits.js";

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
  const [pickupDate, setPickupDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [creditError, setCreditError] = useState<CreditError | null>(null);
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const unit = units[product.unit] || product.unit;
  const available = product.available_quantity ?? product.quantity;
  const subtitle = storeLine ?? [product.business_name, product.city].filter(Boolean).join(" · ");
  // The server accepts a pickup from today up to the end of the expiry day.
  const minPickup = `${toDateInput(new Date())}T00:00`;
  const maxPickup = `${product.expiry_date.slice(0, 10)}T23:59`;

  const handleReservation = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post("/reservations", {
        product_id: product.id,
        quantity,
        pickup_date: pickupDate,
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

      <div className="space-y-4">
        <FormField label={t("dashboard.quantity")} icon={Scale} suffix={unit}>
          <input
            type="number"
            min="0.01"
            step="any"
            max={available}
            placeholder={`${t("myReservations.placeholderMax")}: ${parseFloat(available)}`}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={`${inputStyle} pr-14`}
          />
        </FormField>
        <FormField label={t("myReservations.pickupDate")} icon={CalendarClock}>
          <input
            type="datetime-local"
            min={minPickup}
            max={maxPickup}
            value={pickupDate}
            onChange={(e) => setPickupDate(e.target.value)}
            className={inputStyle}
          />
        </FormField>
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
          type="button"
          onClick={handleReservation}
          disabled={submitting}
          className="flex-1 cursor-pointer rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"
        >
          {t("myReservations.confirmButton")}
        </button>
      </div>
    </Modal>
  );
}

export default ReserveProductModal;
