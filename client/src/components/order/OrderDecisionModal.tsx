import { useId, useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, TriangleAlert, X } from "lucide-react";
import api from "../../api/axios.js";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../product/Modal.js";
import { inputStyle } from "../form/FormField.js";
import {
  CHANGE_REASONS,
  formatAmount,
  formatMoney,
  formatOrderCode,
  MAX_CHANGE_NOTE,
} from "../../utils/orders.js";
import type { ChangeReason, Order, OrderItem } from "../../types/index.js";

type Action = "ACCEPT" | "ACCEPT_LESS" | "REJECT";

interface Line {
  action: Action;
  // The accepted quantity for ACCEPT_LESS.
  quantity: string;
  reason: ChangeReason | "";
  note: string;
  // "Record the difference as sold in the shop" (only with NOT_ENOUGH_STOCK) and its amount.
  sale: boolean;
  saleQuantity: string;
}

// The whole order rejected: one reason, and per product an optional shop sale.
interface Rejection {
  reason: ChangeReason | "";
  note: string;
  sales: Record<number, { sale: boolean; quantity: string }>;
}

type Step = "decide" | "reject" | "confirm";

interface OrderDecisionModalProps {
  order: Pick<Order, "id" | "code" | "accept_partial" | "items">;
  // The restaurant's name, for the title.
  restaurant: string;
  onClose: () => void;
  // Called after the decision is saved (the modal has already closed).
  onDecided: () => void;
}

const EMPTY_LINE: Line = { action: "ACCEPT", quantity: "", reason: "", note: "", sale: false, saleQuantity: "" };

const ordered = (item: OrderItem) => Number(item.quantity);
const price = (item: OrderItem) => Number(item.unit_price);

// The store's till sold food this item holds (products.shop_shortage): the item can accept at most
// its quantity minus that, and nothing when the till sold it all.
const shortageOf = (item: OrderItem) => Number(item.shop_shortage ?? 0);
const maxAcceptable = (item: OrderItem) => Math.max(ordered(item) - shortageOf(item), 0);

// An item the till sold part of starts on "accept less" with what is left (or "reject" when
// nothing is), with "not enough in stock" as the reason.
const initialLine = (item: OrderItem): Line => {
  if (shortageOf(item) <= 0) return EMPTY_LINE;
  const max = maxAcceptable(item);
  return max > 0
    ? { ...EMPTY_LINE, action: "ACCEPT_LESS", quantity: String(Math.round(max * 1000) / 1000), reason: "NOT_ENOUGH_STOCK" }
    : { ...EMPTY_LINE, action: "REJECT", reason: "NOT_ENOUGH_STOCK" };
};

// The line accepts more than the till left (an error key or null).
const shortageError = (item: OrderItem, line: Line) =>
  shortageOf(item) > 0 && line.action !== "REJECT" && acceptedOf(item, line) > maxAcceptable(item)
    ? "orders.decision.errors.shortage"
    : null;

// The accepted quantity a line stands for (NaN while the field is not a number).
const acceptedOf = (item: OrderItem, line: Line) =>
  line.action === "ACCEPT" ? ordered(item) : line.action === "REJECT" ? 0 : Number(line.quantity);

// The reason and note a smaller quantity or a rejection needs; an error key or null.
const reasonError = (reason: ChangeReason | "", note: string) => {
  if (!reason) return "orders.decision.errors.reason";
  if ((reason === "OTHER" && note.trim() === "") || note.trim().length > MAX_CHANGE_NOTE) {
    return "orders.decision.errors.note";
  }
  return null;
};

// A shop sale: above 0 (0 or empty records nothing) and at most what the decision frees.
const saleError = (sale: boolean, quantity: string, freed: number) => {
  if (!sale || quantity.trim() === "") return null;
  const amount = Number(quantity);
  return Number.isNaN(amount) || amount < 0 || amount > freed ? "orders.decision.errors.sale" : null;
};

const lineError = (item: OrderItem, line: Line) => {
  const shortage = shortageError(item, line);
  if (shortage) return shortage;
  if (line.action === "ACCEPT") return null;
  if (line.action === "ACCEPT_LESS") {
    const accepted = Number(line.quantity);
    if (line.quantity.trim() === "" || Number.isNaN(accepted) || accepted <= 0 || accepted >= ordered(item)) {
      return "orders.decision.errors.quantity";
    }
  }
  return (
    reasonError(line.reason, line.note) ??
    (line.reason === "NOT_ENOUGH_STOCK" ? saleError(line.sale, line.saleQuantity, ordered(item) - acceptedOf(item, line)) : null)
  );
};

// A sale worth sending: ticked, with NOT_ENOUGH_STOCK, above 0.
const saleAmount = (sale: boolean, quantity: string, reason: ChangeReason | "") =>
  sale && reason === "NOT_ENOUGH_STOCK" && Number(quantity) > 0 ? Number(quantity) : null;

// The store decides a Pending order (docs/orders-design.md, section 6). With partial fulfilment
// on, each item is accepted, accepted with less or rejected (the last two with a reason, and with
// "not enough in stock" the difference can be recorded as sold in the shop); with it off, only the
// whole order can be accepted or rejected. A summary step comes before the irreversible save.
function OrderDecisionModal({ order, restaurant, onClose, onDecided }: OrderDecisionModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const items = order.items.filter((item) => item.status === "Pending");
  const [step, setStep] = useState<Step>("decide");
  // Where the summary goes back to.
  const [confirming, setConfirming] = useState<"decide" | "reject">("decide");
  const [lines, setLines] = useState<Record<number, Line>>(() =>
    Object.fromEntries(items.map((item) => [item.id, initialLine(item)])),
  );
  const [rejection, setRejection] = useState<Rejection>({ reason: "", note: "", sales: {} });
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);

  const code = formatOrderCode(order.code);
  const lineOf = (item: OrderItem) => lines[item.id] ?? EMPTY_LINE;
  const setLine = (item: OrderItem, change: Partial<Line>) =>
    setLines((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? EMPTY_LINE), ...change } }));

  const orderedTotal = items.reduce((sum, item) => sum + ordered(item) * price(item), 0);
  const newTotal = items.reduce((sum, item) => {
    const accepted = acceptedOf(item, lineOf(item));
    return sum + (Number.isNaN(accepted) ? 0 : accepted) * price(item);
  }, 0);
  const counts = {
    accepted: items.filter((item) => lineOf(item).action === "ACCEPT").length,
    reduced: items.filter((item) => lineOf(item).action === "ACCEPT_LESS").length,
    rejected: items.filter((item) => lineOf(item).action === "REJECT").length,
  };

  const rejectionErrors = {
    reason: reasonError(rejection.reason, rejection.note),
    sales: Object.fromEntries(
      items.map((item) => {
        const sale = rejection.sales[item.id];
        return [item.id, rejection.reason === "NOT_ENOUGH_STOCK" && sale ? saleError(sale.sale, sale.quantity, ordered(item)) : null];
      }),
    ),
  };

  // The till sold food of these items: their toast says what to do (the server checks it too).
  const shortageItems = items.filter((item) => shortageOf(item) > 0);
  const shortageToast = (item: OrderItem) => {
    const max = maxAcceptable(item);
    toast.error(
      !order.accept_partial
        ? t("orders.decision.mustRejectOrder", { product: item.product_name, left: formatAmount(max, item.unit) })
        : max > 0
          ? t("orders.decision.acceptAtMost", { product: item.product_name, amount: formatAmount(max, item.unit) })
          : t("orders.decision.mustRejectItem", { product: item.product_name }),
    );
  };

  const toConfirm = (from: "decide" | "reject") => {
    const tooMuch = from === "decide" ? items.find((item) => shortageError(item, lineOf(item))) : undefined;
    if (tooMuch) {
      setShowErrors(true);
      shortageToast(tooMuch);
      return;
    }
    const invalid =
      from === "decide"
        ? items.some((item) => lineError(item, lineOf(item)))
        : Boolean(rejectionErrors.reason) || Object.values(rejectionErrors.sales).some(Boolean);
    if (invalid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setConfirming(from);
    setStep("confirm");
  };

  // Partial fulfilment off: "Accept all" goes straight to the summary.
  const acceptAll = () => {
    const sold = shortageItems[0];
    if (sold) {
      shortageToast(sold);
      return;
    }
    setLines(Object.fromEntries(items.map((item) => [item.id, EMPTY_LINE])));
    setConfirming("decide");
    setStep("confirm");
  };

  const body = () => {
    if (confirming === "reject") {
      const note = rejection.note.trim();
      return {
        reject_order: true,
        reason: rejection.reason,
        ...(note && { note }),
        shop_sales: items.flatMap((item) => {
          const sale = rejection.sales[item.id];
          const amount = sale ? saleAmount(sale.sale, sale.quantity, rejection.reason) : null;
          return amount ? [{ product_id: item.product_id, quantity: amount }] : [];
        }),
      };
    }
    return {
      items: items.map((item) => {
        const line = lineOf(item);
        if (line.action === "ACCEPT") return { item_id: item.id, action: "ACCEPT" };
        const note = line.note.trim();
        const sale = saleAmount(line.sale, line.saleQuantity, line.reason);
        return {
          item_id: item.id,
          action: line.action,
          ...(line.action === "ACCEPT_LESS" && { quantity: Number(line.quantity) }),
          reason: line.reason,
          ...(note && { note }),
          ...(sale && { record_shop_sale: sale }),
        };
      }),
    };
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await api.post(`/orders/${order.id}/decision`, body());
      toast.success(response.data.message);
      onClose();
      onDecided();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("reservations.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const reasonFields = (
    idPrefix: string,
    reason: ChangeReason | "",
    note: string,
    onChange: (change: { reason?: ChangeReason | ""; note?: string }) => void,
    error: string | null,
  ) => (
    <div className="space-y-2">
      <select
        aria-label={t("orders.decision.reason")}
        value={reason}
        onChange={(e) => onChange({ reason: e.target.value as ChangeReason | "" })}
        className={inputStyle}
      >
        <option value="">{t("orders.decision.chooseReason")}</option>
        {CHANGE_REASONS.map((value) => (
          <option key={value} value={value}>
            {t(`orders.reasonLabels.${value}`)}
          </option>
        ))}
      </select>
      {reason === "OTHER" && (
        <textarea
          id={`${idPrefix}-note`}
          aria-label={t("orders.decision.note")}
          placeholder={t("orders.decision.notePlaceholder")}
          maxLength={MAX_CHANGE_NOTE}
          rows={2}
          value={note}
          onChange={(e) => onChange({ note: e.target.value })}
          className={inputStyle}
        />
      )}
      {showErrors && error && (error === "orders.decision.errors.reason" || error === "orders.decision.errors.note") && (
        <p role="alert" className="text-sm text-red-600">
          {t(error)}
        </p>
      )}
    </div>
  );

  const saleField = (
    label: string,
    checked: boolean,
    quantity: string,
    unit: string,
    onToggle: (checked: boolean) => void,
    onQuantity: (value: string) => void,
    error: string | null,
  ) => (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 accent-orange-500" />
        {label}
      </label>
      {checked && (
        <div className="flex items-center gap-2 pl-6">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            aria-label={t("orders.decision.saleQuantity")}
            value={quantity}
            onChange={(e) => onQuantity(e.target.value)}
            className={`${inputStyle} w-28`}
          />
          <span className="text-sm text-gray-500">{t(`units.${unit}`, { defaultValue: unit })}</span>
        </div>
      )}
      {showErrors && error === "orders.decision.errors.sale" && (
        <p role="alert" className="pl-6 text-sm text-red-600">
          {t(error)}
        </p>
      )}
    </div>
  );

  // The warning on an item the till sold part of.
  const shortageNote = (item: OrderItem) => {
    if (shortageOf(item) <= 0) return null;
    const max = maxAcceptable(item);
    return (
      <p data-testid="shortage-note" className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        {max > 0
          ? t("orders.decision.shortage", { amount: formatAmount(max, item.unit) })
          : t("orders.decision.shortageAll")}
      </p>
    );
  };

  const itemHeader = (item: OrderItem) => (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-semibold text-gray-900">{item.product_name}</p>
        <p className="text-sm text-gray-500">
          {formatAmount(item.quantity, item.unit)} × {formatMoney(item.unit_price)}
        </p>
      </div>
      <p className="shrink-0 font-semibold text-gray-800 tabular-nums">{formatMoney(ordered(item) * price(item))}</p>
    </div>
  );

  const decideStep = order.accept_partial ? (
    <div className="space-y-4">
      {items.map((item) => {
        const line = lineOf(item);
        const error = lineError(item, line);
        const freed = ordered(item) - acceptedOf(item, line);
        return (
          <section key={item.id} data-testid="decision-line" className="space-y-3 rounded-xl border border-gray-100 p-3">
            {itemHeader(item)}
            {shortageNote(item)}
            <div role="radiogroup" aria-label={item.product_name} className="grid grid-cols-3 gap-1 rounded-xl bg-gray-50 p-1">
              {(["ACCEPT", "ACCEPT_LESS", "REJECT"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  role="radio"
                  aria-checked={line.action === action}
                  onClick={() => setLine(item, { action })}
                  className={`min-h-11 cursor-pointer rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors sm:min-h-0 sm:text-sm ${
                    line.action === action
                      ? action === "REJECT"
                        ? "bg-red-600 text-white"
                        : "bg-orange-500 text-white"
                      : "text-gray-600 hover:bg-white"
                  }`}
                >
                  {t(`orders.decision.actions.${action}`)}
                </button>
              ))}
            </div>
            {line.action === "ACCEPT_LESS" && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label={t("orders.decision.acceptedQuantity", { product: item.product_name })}
                    placeholder={t("orders.decision.lessThan", { amount: formatAmount(item.quantity, item.unit) })}
                    value={line.quantity}
                    onChange={(e) => setLine(item, { quantity: e.target.value })}
                    className={`${inputStyle} w-40`}
                  />
                  <span className="text-sm text-gray-500">{t(`units.${item.unit}`, { defaultValue: item.unit })}</span>
                </div>
                {showErrors && (error === "orders.decision.errors.quantity" || error === "orders.decision.errors.shortage") && (
                  <p role="alert" className="text-sm text-red-600">
                    {t(error)}
                  </p>
                )}
              </div>
            )}
            {line.action !== "ACCEPT" && (
              <>
                {reasonFields(`line-${item.id}`, line.reason, line.note, (change) => setLine(item, change), error)}
                {line.reason === "NOT_ENOUGH_STOCK" &&
                  saleField(
                    t("orders.decision.recordSale"),
                    line.sale,
                    line.saleQuantity,
                    item.unit,
                    (checked) =>
                      setLine(item, { sale: checked, saleQuantity: checked && !Number.isNaN(freed) ? String(freed) : "" }),
                    (value) => setLine(item, { saleQuantity: value }),
                    error,
                  )}
              </>
            )}
          </section>
        );
      })}
    </div>
  ) : (
    <div className="space-y-3">
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
        {shortageItems.length > 0 ? t("orders.decision.wholeOnlySold") : t("orders.decision.wholeOnly")}
      </p>
      {items.map((item) => (
        <div key={item.id} className="space-y-2 rounded-xl border border-gray-100 p-3">
          {itemHeader(item)}
          {shortageNote(item)}
        </div>
      ))}
    </div>
  );

  const rejectStep = (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t("orders.decision.rejectText", { code, restaurant })}</p>
      {reasonFields(
        "order",
        rejection.reason,
        rejection.note,
        (change) => setRejection((current) => ({ ...current, ...change })),
        rejectionErrors.reason,
      )}
      {rejection.reason === "NOT_ENOUGH_STOCK" && (
        <div className="space-y-3">
          {items.map((item) => {
            const sale = rejection.sales[item.id] ?? { sale: false, quantity: "" };
            const setSale = (change: Partial<typeof sale>) =>
              setRejection((current) => ({ ...current, sales: { ...current.sales, [item.id]: { ...sale, ...change } } }));
            return (
              <div key={item.id} className="rounded-xl border border-gray-100 p-3">
                {saleField(
                  t("orders.decision.recordSaleOf", { product: item.product_name }),
                  sale.sale,
                  sale.quantity,
                  item.unit,
                  (checked) => setSale({ sale: checked, quantity: checked ? String(ordered(item)) : "" }),
                  (value) => setSale({ quantity: value }),
                  rejectionErrors.sales[item.id] ?? null,
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const summary =
    confirming === "reject"
      ? t("orders.decision.summaryReject", { code })
      : counts.accepted === items.length
        ? t("orders.decision.summaryAll", { count: items.length, total: formatMoney(newTotal) })
        : t("orders.decision.summary", {
            accepted: counts.accepted,
            reduced: counts.reduced,
            rejected: counts.rejected,
            total: formatMoney(newTotal),
          });

  const confirmStep = (
    <div className="space-y-3">
      <p className="font-medium text-gray-900">{summary}</p>
      <p className="text-sm text-gray-600">{t("orders.decision.irreversible")}</p>
    </div>
  );

  const secondaryButton =
    "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200";
  const dangerButton =
    "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2.5 font-semibold text-red-600 transition-colors hover:bg-red-50";
  const primaryButton =
    "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-wait disabled:opacity-60";

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <ModalHeader>
        <h3 id={titleId} className="text-lg font-bold text-gray-900">
          {step === "reject" ? t("orders.decision.rejectTitle", { code }) : t("orders.decision.title", { code })}
        </h3>
        <p className="text-sm text-gray-500">{restaurant}</p>
      </ModalHeader>

      <ModalBody>{step === "decide" ? decideStep : step === "reject" ? rejectStep : confirmStep}</ModalBody>

      {step === "decide" && order.accept_partial && (
        <p data-testid="decision-total" className="shrink-0 px-6 pt-3 text-sm text-gray-600">
          {Math.round(newTotal * 100) === Math.round(orderedTotal * 100)
            ? t("orders.decision.total", { total: formatMoney(orderedTotal) })
            : t("orders.decision.newTotal", { total: formatMoney(newTotal), ordered: formatMoney(orderedTotal) })}
        </p>
      )}

      <ModalFooter className="flex-col sm:flex-row">
        {step === "decide" && (
          <>
            <button type="button" onClick={() => setStep("reject")} className={dangerButton}>
              <X className="h-4 w-4" />
              {t("orders.decision.rejectOrder")}
            </button>
            {order.accept_partial ? (
              <button type="button" onClick={() => toConfirm("decide")} className={primaryButton}>
                <Check className="h-4 w-4" />
                {t("orders.decision.confirmDecision")}
              </button>
            ) : (
              <button type="button" onClick={acceptAll} className={primaryButton}>
                <Check className="h-4 w-4" />
                {t("orders.decision.acceptAll")}
              </button>
            )}
          </>
        )}
        {step === "reject" && (
          <>
            <button
              type="button"
              onClick={() => {
                setShowErrors(false);
                setStep("decide");
              }}
              className={secondaryButton}
            >
              <ArrowLeft className="h-4 w-4" />
              {t("orders.decision.back")}
            </button>
            <button
              type="button"
              onClick={() => toConfirm("reject")}
              className={`${primaryButton} bg-red-600 hover:bg-red-700`}
            >
              <X className="h-4 w-4" />
              {t("orders.decision.rejectOrder")}
            </button>
          </>
        )}
        {step === "confirm" && (
          <>
            <button type="button" onClick={() => setStep(confirming)} disabled={busy} className={secondaryButton}>
              <ArrowLeft className="h-4 w-4" />
              {t("orders.decision.back")}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className={confirming === "reject" ? `${primaryButton} bg-red-600 hover:bg-red-700` : primaryButton}
            >
              <Check className="h-4 w-4" />
              {confirming === "reject" ? t("orders.decision.saveReject") : t("orders.decision.save")}
            </button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}

export default OrderDecisionModal;
