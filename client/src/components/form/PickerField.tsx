import { useId } from "react";
import type { ReactNode } from "react";
import FieldError from "./FieldError.js";
import { requiredMark } from "./FormField.js";

interface PickerFieldProps {
  label: string;
  required?: boolean;
  // A translated message; the picker gets a red outline and the message below it.
  error?: string | undefined;
  // Called when focus leaves the picker (not when it moves between its options).
  onBlur?: () => void;
  // The picker itself: option buttons, cards or a file input.
  children: ReactNode;
}

// The label, outline and error message of a field that is not one input (category buttons, a file
// picker). On a failed submit the form focuses the first focusable element inside it.
function PickerField({ label, required = false, error, onBlur, children }: PickerFieldProps) {
  const labelId = useId();
  const errorId = useId();
  return (
    <div>
      <span id={labelId} className={`mb-1.5 block text-sm font-medium text-gray-700 ${required ? requiredMark : ""}`}>
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        data-invalid={error ? true : undefined}
        onBlur={(e) => {
          if (onBlur && !e.currentTarget.contains(e.relatedTarget)) onBlur();
        }}
        className={error ? "-m-1 rounded-2xl p-1 ring-2 ring-red-300" : undefined}
      >
        {children}
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export default PickerField;
