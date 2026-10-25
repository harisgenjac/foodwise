import { cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import FieldError from "./FieldError.js";

// Shared input look. Pair it with FormField, which adds the leading icon (pl-10 leaves room for it).
export const inputStyle =
  "w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

// The red asterisk of a required field's label. It is CSS content, so it is not part of the
// label's accessible name; the field itself carries aria-required.
export const requiredMark = "after:ml-0.5 after:text-red-500 after:content-['*']";

// Turns an input style red for a field with an error (border and focus ring).
export const invalidStyle = (className: string) =>
  className
    .replace("border-gray-200", "border-red-400")
    .replace("focus:border-orange-400", "focus:border-red-400")
    .replace("focus:ring-orange-100", "focus:ring-red-100");

// What FormField adds to its input, select or textarea.
interface FieldA11yProps {
  className?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "data-invalid"?: boolean;
}

// The attributes FormField gives its field: the error style and the links to the message.
const fieldA11y = (
  className: string,
  required: boolean,
  error: string | undefined,
  errorId: string,
): FieldA11yProps => ({
  className: error ? invalidStyle(className) : className,
  ...(required && { "aria-required": true }),
  ...(error && { "aria-invalid": true, "aria-describedby": errorId, "data-invalid": true }),
});

interface FormFieldProps {
  label: string;
  // A leading icon inside the field (the input then needs inputStyle's pl-10); plain fields have none.
  icon?: LucideIcon;
  suffix?: string;
  // Marks the label with a red asterisk; the field itself is validated by the form.
  required?: boolean;
  // A translated message; the field turns red and the message is shown below it.
  error?: string | undefined;
  // One input, select or textarea, without its own label.
  children: ReactNode;
}

function FormField({ label, icon: Icon, suffix, required = false, error, children }: FormFieldProps) {
  const errorId = useId();
  const field = isValidElement<FieldA11yProps>(children)
    ? cloneElement(children as ReactElement<FieldA11yProps>, fieldA11y(children.props.className ?? "", required, error, errorId))
    : children;

  return (
    <div>
      <label className="block">
        <span className={`mb-1.5 block text-sm font-medium text-gray-700 ${required ? requiredMark : ""}`}>
          {label}
        </span>
        <span className="relative block">
          {Icon && <Icon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" strokeWidth={1.8} />}
          {field}
          {suffix && (
            <span className="pointer-events-none absolute right-3 top-2.5 text-sm font-medium text-gray-400">
              {suffix}
            </span>
          )}
        </span>
      </label>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export default FormField;
