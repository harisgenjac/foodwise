import { useTranslation } from "react-i18next";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatAmount } from "../../utils/orders.js";

interface QuantityStepperProps {
  // The product (for the buttons' names) and its unit code.
  name: string;
  unit: string;
  value: number;
  // At most this much (the free quantity).
  max: number;
  busy?: boolean;
  onChange: (value: number) => void;
}

const buttonStyle =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-brand-800 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9";

// − amount + for a product in the cart: steps of 1 (the last step up takes what is left), and −
// at 1 or less removes the line (a bin icon then).
function QuantityStepper({ name, unit, value, max, busy = false, onChange }: QuantityStepperProps) {
  const { t } = useTranslation();
  const removes = value <= 1;
  const next = Math.min(value + 1, max);

  return (
    <div
      role="group"
      aria-label={t("stepper.label", { name })}
      className="inline-flex items-center gap-1 rounded-full bg-brand-50 p-0.5"
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => onChange(removes ? 0 : value - 1)}
        aria-label={removes ? t("stepper.remove", { name }) : t("stepper.decrease", { name })}
        className={buttonStyle}
      >
        {removes ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </button>
      <span aria-live="polite" className="min-w-12 text-center text-sm font-semibold text-neutral-900 tabular-nums">
        {formatAmount(value, unit)}
      </span>
      <button
        type="button"
        disabled={busy || next <= value}
        onClick={() => onChange(next)}
        aria-label={t("stepper.increase", { name })}
        className={buttonStyle}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export default QuantityStepper;
