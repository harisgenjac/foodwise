import { useId, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Modal from "../product/Modal.js";
import FormField from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";

export type ConfirmVariant = "success" | "danger";

interface ConfirmModalProps {
  title: string;
  message: ReactNode;
  // Named after the action ("Accept", "Delete product"), never "OK" or "Yes".
  confirmLabel: string;
  cancelLabel?: string;
  variant: ConfirmVariant;
  icon?: LucideIcon;
  busy: boolean;
  // Required reason, sent with the action and shown to the affected user.
  reason?: boolean;
  // Extra content between the message and the buttons, e.g. a summary of what is confirmed.
  children?: ReactNode;
  // Gets the trimmed reason, or "" when no reason is asked.
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

const MAX_REASON_LENGTH = 500;

const VARIANT_STYLES: Record<ConfirmVariant, { icon: string; button: string }> = {
  success: { icon: "bg-green-50 text-green-600", button: "bg-green-600 hover:bg-green-700" },
  danger: { icon: "bg-red-50 text-red-600", button: "bg-red-600 hover:bg-red-700" },
};

// The one confirmation dialog for actions that cannot be undone, notify another party or
// spend credits in bulk. Escape and a backdrop click cancel; while `busy` the confirm button
// is disabled, so one request is sent. A danger dialog starts on Cancel, so Enter never
// confirms by accident.
function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant,
  icon,
  busy,
  reason: askReason = false,
  children,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [reason, setReason] = useState("");
  const { formRef, errorFor, blur, validate } = useFormValidation({
    reason: askReason && isBlank(reason) ? REQUIRED : undefined,
  });
  const reasonError = errorFor("reason");
  const styles = VARIANT_STYLES[variant];
  const Icon = icon ?? (variant === "danger" ? AlertTriangle : CheckCircle2);
  const isDanger = variant === "danger";

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || !validate()) return;
    onConfirm(askReason ? reason.trim() : "");
  };

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <form ref={formRef} noValidate onSubmit={handleSubmit}>
        <div className="flex flex-col items-center text-center">
          <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${styles.icon}`}>
            <Icon className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <h3 id={titleId} className="text-lg font-bold text-gray-900">
            {title}
          </h3>
          <div className="mt-1 text-sm text-gray-500">{message}</div>
        </div>

        {children}

        {askReason && (
          <div className="mt-5">
            <FormField label={t("admin.common.reasonLabel")} required error={reasonError}>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={blur("reason")}
                maxLength={MAX_REASON_LENGTH}
                rows={3}
                placeholder={t("admin.common.reasonPlaceholder")}
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
              />
            </FormField>
            {!reasonError && <p className="mt-1 text-xs text-gray-500">{t("admin.common.reasonHint")}</p>}
            <RequiredHint className="mt-1" />
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            autoFocus={isDanger}
            className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            autoFocus={!isDanger}
            className={`flex-1 cursor-pointer rounded-xl py-2.5 font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-60 ${styles.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default ConfirmModal;
