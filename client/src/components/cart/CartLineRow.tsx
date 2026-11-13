import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Ban, Trash2 } from "lucide-react";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import { formatAmount, formatMoney } from "../../utils/orders.js";
import type { CartLine } from "../../types/index.js";

interface CartLineRowProps {
  line: CartLine;
  // The last send refused the order because of this line (partial fulfilment off).
  blockedSending: boolean;
  busy: boolean;
  onSetQuantity: (quantity: number, options?: { acceptPrice?: boolean }) => void;
  onRemove: () => void;
}

// One line of the cart with the product's live state: an unavailable line is greyed out and can
// only be removed; less stock offers to reduce; a higher price must be accepted before it is sent.
function CartLineRow({ line, blockedSending, busy, onSetQuantity, onRemove }: CartLineRowProps) {
  const { t } = useTranslation();
  // The short unit code ("kg"), as on the order pages.
  const unit = line.unit;
  const { flags } = line;
  const quantity = parseFloat(line.quantity);
  const available = parseFloat(line.available_quantity);
  const [draft, setDraft] = useState(String(quantity));

  // A saved or refused change shows the cart's quantity again.
  useEffect(() => setDraft(String(quantity)), [quantity]);

  const commit = () => {
    const next = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(next) || next <= 0) {
      setDraft(String(quantity));
      return;
    }
    if (next !== quantity) onSetQuantity(next);
  };

  const sentQuantity = Math.min(quantity, available);
  const lineTotal = flags.unavailable || flags.price_raised ? null : sentQuantity * Number(line.discounted_price);

  return (
    <li
      data-testid="cart-line"
      className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start ${
        blockedSending ? "border-red-200" : "border-gray-100"
      }`}
    >
      <img
        src={CATEGORY_IMAGES[line.category] || CATEGORY_IMAGES.Other}
        alt=""
        className={`h-16 w-16 shrink-0 rounded-xl object-cover ${flags.unavailable ? "opacity-50 grayscale" : ""}`}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <Link
            to={`/products/${line.product_id}`}
            className={`font-semibold hover:text-orange-700 ${flags.unavailable ? "text-gray-400" : "text-gray-900"}`}
          >
            {line.name}
          </Link>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label={t("cart.remove", { name: line.name })}
            className="-m-1.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {flags.unavailable ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
            <Ban className="h-4 w-4" />
            {t("cart.unavailable")}
            {flags.unavailable_reason && <span className="font-normal">· {t(`cart.reasons.${flags.unavailable_reason}`)}</span>}
          </p>
        ) : (
          <>
            <p className="text-sm">
              {flags.price_lowered && (
                <span className="mr-1.5 text-gray-400 line-through">{formatMoney(line.unit_price_seen)}</span>
              )}
              <span className="font-semibold text-green-600">{formatMoney(flags.price_raised ? line.unit_price_seen : line.discounted_price)}</span>
              <span className="text-gray-500"> / {unit}</span>
              {flags.price_lowered && <span className="ml-1.5 text-xs font-medium text-green-700">{t("cart.priceLowered")}</span>}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  aria-label={t("cart.quantityLabel", { name: line.name })}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="any"
                  value={draft}
                  disabled={busy}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commit();
                    }
                  }}
                  className="w-24 rounded-lg border border-gray-200 px-2.5 py-1.5 text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                />
                {unit}
              </span>
              {lineTotal !== null && <span className="text-sm font-semibold text-gray-900">{formatMoney(lineTotal)}</span>}
            </div>

            {flags.quantity_exceeds && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("cart.lessStock", { amount: formatAmount(available, unit) })}
                <button
                  type="button"
                  onClick={() => onSetQuantity(available)}
                  disabled={busy}
                  className="cursor-pointer font-semibold underline underline-offset-2 hover:text-amber-900 disabled:cursor-not-allowed"
                >
                  {t("cart.reduceTo", { amount: formatAmount(available, unit) })}
                </button>
              </div>
            )}

            {flags.price_raised && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("cart.priceRaised", { price: formatMoney(line.discounted_price), old: formatMoney(line.unit_price_seen) })}
                <button
                  type="button"
                  onClick={() => onSetQuantity(Math.min(quantity, available), { acceptPrice: true })}
                  disabled={busy}
                  className="cursor-pointer font-semibold underline underline-offset-2 hover:text-amber-900 disabled:cursor-not-allowed"
                >
                  {t("cart.acceptPrice")}
                </button>
              </div>
            )}
          </>
        )}

        {blockedSending && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {t("cart.notSentLine")}
          </p>
        )}
      </div>
    </li>
  );
}

export default CartLineRow;
