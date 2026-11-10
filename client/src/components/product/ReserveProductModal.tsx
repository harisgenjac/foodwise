import { useId, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Clock, Scale } from "lucide-react";
import api from "../../api/axios.js";
import Modal, { ModalBody, ModalFooter, ModalHeader, modalFormStyle } from "./Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import DateInput from "../form/DateInput.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import { formatTimeTyping, parseTimeInput, toDateInput } from "../../utils/expiry.js";
import { formatAmount, formatMoney, formatOrderCode, sendChangeText } from "../../utils/orders.js";
import type { Product, SendChange, SendChangeKind } from "../../types/index.js";

interface ReserveProductModalProps {
  product: Product;
  // Shown under the name; defaults to the product's store and city.
  storeLine?: string;
  onClose: () => void;
  // Called after the order was sent (the modal then shows what was sent).
  onReserved: () => void;
}

// What the server sent back: the order's code, its lines and what sending changed.
interface SentOrder {
  code: string;
  total: number;
  changes: SendChange[];
}

// A line the server would not send (409 ORDER_NOT_SENT).
interface ProblemLine {
  kind: SendChangeKind;
  available: number;
  unit_price: number;
}

// The order form on BrowseProducts, ProductDetails and StoreDetails: one product sent as a
// one-item order (the cart comes later). With partial fulfilment accepted the server may send
// less than asked or at a lower price, and the result step lists what changed.
function ReserveProductModal({ product, storeLine, onClose, onReserved }: ReserveProductModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [quantity, setQuantity] = useState("");
  // YYYY-MM-DD, and the time text (masked as HH:MM while typing, completed on blur).
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [acceptPartial, setAcceptPartial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Refreshed after the server refuses a quantity that is no longer available.
  const [available, setAvailable] = useState(product.available_quantity ?? product.quantity);
  // The price the restaurant agrees to: the shown one, or a higher one it confirmed.
  const [price, setPrice] = useState(product.discounted_price);
  // Why the last attempt sent nothing.
  const [problem, setProblem] = useState<"soldOut" | "priceRaised" | null>(null);
  const [sent, setSent] = useState<SentOrder | null>(null);
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

  // The server sent nothing: say why and prepare the next attempt.
  const handleNotSent = (line: ProblemLine | undefined) => {
    if (line?.kind === "NOT_SENT_PRICE_RAISED") {
      setPrice(String(line.unit_price));
      setProblem("priceRaised");
    } else if (line?.kind === "QUANTITY_REDUCED" && line.available > 0) {
      // Only with partial fulfilment off: what is left goes into the field for the next attempt.
      setAvailable(String(line.available));
      setQuantity(String(line.available));
      toast.error(t("orders.send.lessStock", { amount: formatAmount(line.available, product.unit) }));
      setProblem(null);
    } else {
      setAvailable("0");
      setProblem("soldOut");
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || problem === "soldOut" || !validate()) return;
    setSubmitting(true);
    try {
      const response = await api.post("/orders", {
        // Local time without a time zone, as the server expects.
        pickup_at: `${pickupDate}T${parsedTime}`,
        accept_partial: acceptPartial,
        items: [{ product_id: product.id, quantity: Number(quantity), unit_price: price }],
      });
      const order = response.data.order as { code: string; items: { quantity: string; unit_price: string }[] };
      setSent({
        code: order.code,
        total: order.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0),
        changes: response.data.changes,
      });
      onReserved();
    } catch (err) {
      console.error(err);
      const data = axios.isAxiosError(err) ? err.response?.data : null;
      if (data?.code === "ORDER_NOT_SENT") {
        handleNotSent(data.lines?.[0]);
      } else {
        toast.error(data?.error || t("reservations.actionError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const productSummary = (
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
          <span className="font-semibold text-green-600">{price} KM</span>
          <span className="text-gray-400"> · </span>
          <span className="text-gray-600">
            {t("product.available")}: {parseFloat(available)} {unit}
          </span>
        </p>
      </div>
    </div>
  );

  if (sent) {
    return (
      <Modal onClose={onClose} labelledBy={titleId}>
        <ModalHeader>
          <h3 id={titleId} className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            {t("orders.send.sentTitle", { code: formatOrderCode(sent.code) })}
          </h3>
        </ModalHeader>
        <ModalBody>
          {productSummary}
          <p className="text-sm text-gray-700">
            {t("orders.send.sentText", { total: formatMoney(sent.total), store: product.business_name ?? "" })}
          </p>
          {sent.changes.length > 0 && (
            <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
              <p className="mb-1 font-semibold">{t("orders.sendChangesTitle")}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {sent.changes.map((change) => (
                  <li key={`${change.product_id}-${change.kind}`}>{sendChangeText(change, t)}</li>
                ))}
              </ul>
            </div>
          )}
        </ModalBody>
        <ModalFooter className="pt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {t("orders.send.close")}
          </button>
          <Link
            to="/my-orders"
            onClick={onClose}
            className="flex-1 rounded-xl bg-orange-500 py-2.5 text-center font-semibold text-white transition-colors hover:bg-orange-600"
          >
            {t("orders.send.toMyOrders")}
          </Link>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <ModalHeader>
        <h3 id={titleId} className="text-lg font-bold text-gray-900">
          {t("orders.send.title")}
        </h3>
      </ModalHeader>

      <form ref={formRef} noValidate onSubmit={handleSubmit} className={modalFormStyle}>
        <ModalBody>
          {productSummary}

          {problem && (
            <p role="alert" className="mb-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {problem === "soldOut"
                ? t("orders.send.soldOut")
                : t("orders.send.priceRaised", { price: formatMoney(price), old: formatMoney(product.discounted_price) })}
            </p>
          )}

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
                inputMode="decimal"
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
            <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={acceptPartial}
                onChange={(e) => setAcceptPartial(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-orange-500"
              />
              {t("orders.send.acceptPartial")}
            </label>
            <RequiredHint />
          </div>
        </ModalBody>

        <ModalFooter className="pt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {t("myReservations.cancelButton")}
          </button>
          <button
            type="submit"
            disabled={submitting || problem === "soldOut"}
            className="flex-1 cursor-pointer rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {problem === "priceRaised" ? t("orders.send.confirmNewPrice") : t("orders.send.submit")}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default ReserveProductModal;
