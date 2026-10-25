import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import Modal from "../product/Modal.js";
import FormField from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";

interface ReasonModalProps {
  title: string;
  text: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

const MAX_REASON_LENGTH = 500;

// Confirmation for blocking an account or removing an offer; the server requires a reason
// and shows it to the user.
function ReasonModal({ title, text, confirmLabel, busy, onConfirm, onClose }: ReasonModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const { formRef, errorFor, blur, validate } = useFormValidation({ reason: isBlank(reason) ? REQUIRED : undefined });
  const error = errorFor("reason");

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    onConfirm(reason.trim());
  };

  return (
    <Modal onClose={onClose}>
      <form ref={formRef} noValidate onSubmit={handleSubmit}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-600">{text}</p>
          </div>
        </div>

        <div className="mt-5">
          <FormField label={t("admin.common.reasonLabel")} required error={error}>
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
        </div>
        {!error && <p className="mt-1 text-xs text-gray-500">{t("admin.common.reasonHint")}</p>}
        <RequiredHint className="mt-1" />

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t("admin.common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="cursor-pointer rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default ReasonModal;
