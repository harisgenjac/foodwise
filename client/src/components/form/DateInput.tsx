import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import { inputStyle, invalidStyle, requiredMark } from "./FormField.js";
import FieldError from "./FieldError.js";
import { formatDisplayDate, parseDisplayDate } from "../../utils/expiry.js";

interface DateInputProps {
  label: string;
  // YYYY-MM-DD, or "" for no date.
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  // The same as FormField's: an asterisk on the label, and a translated message that turns the field red.
  required?: boolean;
  error?: string | undefined;
  // After the typed text has been committed (for useFormValidation's blur).
  onBlur?: () => void;
}

// A date field shown as dd/mm/yyyy whatever the browser's locale (a native date input follows the
// locale). The text can be typed; the calendar button opens the native picker of a hidden date input.
function DateInput({ label, value, onChange, min, max, required = false, error, onBlur }: DateInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  // What the user is typing; null shows the current value.
  const [draft, setDraft] = useState<string | null>(null);
  const textStyle = `${inputStyle.replace("pl-10", "pl-3")} pr-10`;

  const commit = () => {
    if (draft === null) return;
    const parsed = parseDisplayDate(draft);
    if (parsed && parsed !== value) onChange(parsed);
    setDraft(null);
  };

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      // Browsers without showPicker (or jsdom) still open the picker on focus and click.
      picker.focus();
      picker.click();
    }
  };

  return (
    <div>
      <label htmlFor={id} className={`mb-1.5 block text-sm font-medium text-gray-700 ${required ? requiredMark : ""}`}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          placeholder={t("common.datePlaceholder")}
          value={draft ?? formatDisplayDate(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            commit();
            onBlur?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className={error ? invalidStyle(textStyle) : textStyle}
          {...(required && { "aria-required": true })}
          {...(error && { "aria-invalid": true, "aria-describedby": errorId, "data-invalid": true })}
        />
        <button
          type="button"
          onClick={openPicker}
          aria-label={t("common.pickDate")}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-orange-50 hover:text-orange-600"
        >
          <CalendarDays className="h-4 w-4" strokeWidth={1.8} />
        </button>
        {/* Anchors the native calendar under the field; never focused or read by screen readers. */}
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="date-picker"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            setDraft(null);
            if (e.target.value) onChange(e.target.value);
          }}
          className="pointer-events-none absolute bottom-0 left-0 h-0 w-full opacity-0"
        />
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export default DateInput;
