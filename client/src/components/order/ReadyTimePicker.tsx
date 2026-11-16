import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { inputStyle } from "../form/FormField.js";
import { PREPARATION_MINUTES } from "../../utils/orderPause.js";
import { formatTimeTyping, parseTimeInput } from "../../utils/expiry.js";

// When a delivery order will be ready, as the store picks it when accepting: in N minutes (the
// store's preparation time is preselected) or at an exact time today.
export type ReadyChoice = { kind: "minutes"; minutes: number } | { kind: "exact"; time: string };

// The ISO time a choice stands for, or null while an exact time is unfinished or already passed.
export function readyAtOf(choice: ReadyChoice, now: Date = new Date()): string | null {
  if (choice.kind === "minutes") return new Date(now.getTime() + choice.minutes * 60 * 1000).toISOString();
  const time = parseTimeInput(choice.time);
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  return at.getTime() > now.getTime() ? at.toISOString() : null;
}

interface ReadyTimePickerProps {
  value: ReadyChoice;
  onChange: (choice: ReadyChoice) => void;
  showError: boolean;
}

function ReadyTimePicker({ value, onChange, showError }: ReadyTimePickerProps) {
  const { t } = useTranslation();
  const timeId = useId();
  const errorId = useId();
  const invalid = value.kind === "exact" && readyAtOf(value) === null;
  const chip = (active: boolean) =>
    `min-h-11 cursor-pointer rounded-xl border px-3 text-sm transition-colors sm:min-h-9 ${
      active ? "border-orange-400 bg-orange-50 font-semibold text-orange-800" : "border-gray-200 text-gray-700 hover:bg-gray-50"
    }`;

  return (
    <fieldset data-testid="ready-time" className="space-y-2 rounded-xl border border-gray-100 p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-gray-900">
        <Clock className="h-4 w-4 text-gray-400" aria-hidden="true" />
        {t("orders.decision.ready.title")}
      </legend>
      <p className="text-xs text-gray-500">{t("orders.decision.ready.hint")}</p>
      <div className="flex flex-wrap gap-2">
        {PREPARATION_MINUTES.map((minutes) => {
          const active = value.kind === "minutes" && value.minutes === minutes;
          return (
            <button
              key={minutes}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ kind: "minutes", minutes })}
              className={chip(active)}
            >
              {t("orderSettings.minutes", { count: minutes })}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={value.kind === "exact"}
          onClick={() => onChange({ kind: "exact", time: value.kind === "exact" ? value.time : "" })}
          className={chip(value.kind === "exact")}
        >
          {t("orders.decision.ready.exact")}
        </button>
      </div>
      {value.kind === "exact" && (
        <div>
          <label htmlFor={timeId} className="mb-1 block text-sm text-gray-700">
            {t("orders.decision.ready.timeLabel")}
          </label>
          <input
            id={timeId}
            type="text"
            inputMode="numeric"
            placeholder={t("orderForm.timePlaceholder")}
            maxLength={5}
            value={value.time}
            onChange={(e) => onChange({ kind: "exact", time: formatTimeTyping(e.target.value, value.time) })}
            aria-invalid={showError && invalid}
            aria-describedby={showError && invalid ? errorId : undefined}
            className={`${inputStyle.replace("pl-10", "pl-3")} sm:w-32`}
          />
          {showError && invalid && (
            <p id={errorId} className="mt-1 text-sm text-red-600">
              {t("orders.decision.ready.invalid")}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

export default ReadyTimePicker;
