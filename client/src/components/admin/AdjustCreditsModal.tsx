import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../product/Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";

const MAX_REASON_LENGTH = 500;
const plainInputStyle = inputStyle.replace("pl-10", "pl-3");

interface AdjustCreditsModalProps {
  busy: boolean;
  onConfirm: (amount: number, reason: string) => void;
  onClose: () => void;
}

// A manual +/− credit correction; the server requires a whole number other than zero and a reason.
function AdjustCreditsModal({ busy, onConfirm, onClose }: AdjustCreditsModalProps) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { formRef, errorFor, blur, validate } = useFormValidation({
    amount: isBlank(amount) ? REQUIRED : undefined,
    reason: isBlank(reason) ? REQUIRED : undefined,
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || !validate()) return;
    onConfirm(Number(amount), reason);
  };

  return (
    <Modal onClose={onClose}>
      <form ref={formRef} noValidate onSubmit={handleSubmit}>
        <h3 className="text-lg font-bold text-gray-900">{t("admin.userCredits.adjustTitle")}</h3>
        <p className="mt-2 text-sm text-gray-600">{t("admin.userCredits.adjustText")}</p>
        <div className="mt-4 space-y-3">
          <FormField label={t("admin.userCredits.amount")} required error={errorFor("amount")}>
            <input
              type="number"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={blur("amount")}
              placeholder="+5 / -2"
              className={plainInputStyle}
            />
          </FormField>
          <FormField label={t("admin.common.reasonLabel")} required error={errorFor("reason")}>
            <textarea
              rows={3}
              maxLength={MAX_REASON_LENGTH}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={blur("reason")}
              className={`${plainInputStyle} resize-none`}
            />
          </FormField>
          <RequiredHint />
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {t("admin.common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 cursor-pointer rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"
          >
            {t("admin.userCredits.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default AdjustCreditsModal;
