import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FieldErrors } from "../utils/validation.js";

const FOCUSABLE = "input:not([type=hidden]), select, textarea, button";

// When to show the errors of a form. `errors` is computed from the current values on every render,
// so an error disappears as soon as its value is valid. A field shows its error once it lost focus
// or after a submit attempt; a fresh form shows none. A failed submit focuses and scrolls to the
// first invalid field (an element with data-invalid inside `formRef`, in page order).
export function useFormValidation<F extends string>(errors: FieldErrors<F>) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [touched, setTouched] = useState<Partial<Record<F, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  // Bumped on every failed submit, so the focus moves after the errors have rendered.
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (focusRequest === 0) return;
    const invalid = formRef.current?.querySelector<HTMLElement>("[data-invalid]");
    if (!invalid) return;
    const target = invalid.matches(FOCUSABLE) ? invalid : invalid.querySelector<HTMLElement>(FOCUSABLE);
    // <main> is the scroll container; scrollIntoView scrolls it (jsdom has no scrollIntoView).
    invalid.scrollIntoView?.({ block: "center", behavior: "smooth" });
    target?.focus({ preventScroll: true });
  }, [focusRequest]);

  const errorFor = (field: F) => {
    const key = errors[field];
    return key && (submitted || touched[field]) ? t(key) : undefined;
  };

  const blur = (field: F) => () => {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  };

  // Call first in a submit handler: false means stop, the errors are shown and focused.
  const validate = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) {
      setFocusRequest((current) => current + 1);
      return false;
    }
    return true;
  };

  // After a form is emptied for a new entry, so it is not red again.
  const reset = () => {
    setTouched({});
    setSubmitted(false);
  };

  return { formRef, errorFor, blur, validate, reset };
}
