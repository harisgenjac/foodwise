import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatNumber } from "../../utils/numbers.js";
import { quantityStep } from "../../utils/units.js";

interface CartStepperProps {
  // The product (for the names of the buttons and the field) and its unit code.
  name: string;
  unit: string;
  // The amount in the cart.
  value: number;
  // At most this much (the product's free quantity).
  max: number;
  busy?: boolean;
  // 0 removes the product from the cart.
  onChange: (value: number) => void;
}

// The smallest amount of a product that goes into the cart: one step, or what is left when that is less.
export const minimumQuantity = (unit: string, max: number) => Math.min(quantityStep(unit), max);

const round = (value: number) => Math.round(value * 1000) / 1000;

// The store page's quantity stepper (design/stores/store-products.html): "−  4 kom  +" on a soft
// green pill. The steps follow the unit (quantityStep), + stops at the free quantity, and − below
// the minimum removes the product (a bin icon then). The amount is also a field: a typed amount is
// saved on blur or Enter, kept between the minimum and the free quantity, and 0 removes it.
function CartStepper({ name, unit, value, max, busy = false, onChange }: CartStepperProps) {
  const { t, i18n } = useTranslation();
  const step = quantityStep(unit);
  const minimum = minimumQuantity(unit, max);
  const shown = formatNumber(value, i18n.language, 3, 0);
  // The text while the field is being edited; null shows the cart's amount.
  const [draft, setDraft] = useState<string | null>(null);
  const next = round(Math.min(value + step, max));
  const previous = round(value - step);
  const removes = previous < minimum;

  const commit = () => {
    if (draft === null) return;
    const typed = parseFloat(draft.replace(",", "."));
    setDraft(null);
    if (!Number.isFinite(typed)) return;
    const amount = typed <= 0 ? 0 : round(Math.min(Math.max(typed, minimum), max));
    if (amount !== value) onChange(amount);
  };

  const button =
    "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-brand-800 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-800 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      role="group"
      aria-label={t("stepper.label", { name })}
      data-testid="cart-stepper"
      className="relative z-10 mt-2.5 flex h-12 items-center justify-between rounded-full border border-brand-200 bg-brand-50 px-0.5"
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => onChange(removes ? 0 : previous)}
        aria-label={removes ? t("stepper.remove", { name }) : t("stepper.decrease", { name })}
        className={button}
      >
        {removes ? <Trash2 className="h-4 w-4" aria-hidden="true" /> : <Minus className="h-4 w-4" aria-hidden="true" />}
      </button>
      <span className="flex min-w-0 items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={draft ?? shown}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(null);
          }}
          aria-label={t("storePage.quantityField", { name, unit })}
          className="w-12 min-w-0 rounded-md bg-transparent text-right text-base font-bold text-neutral-900 tabular-nums outline-none focus:bg-white focus:ring-2 focus:ring-brand-300"
        />
        <span className="text-sm font-semibold text-brand-800">{unit}</span>
      </span>
      <button
        type="button"
        disabled={busy || next <= value}
        onClick={() => onChange(next)}
        aria-label={t("stepper.increase", { name })}
        className={button}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default CartStepper;
