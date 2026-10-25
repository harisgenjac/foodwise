import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import Modal from "../product/Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { REQUIRED } from "../../utils/validation.js";

interface SetPasswordModalProps {
  name: string;
  busy: boolean;
  onConfirm: (password: string) => void;
  onClose: () => void;
}

// The admin sets a temporary password, typed twice; the user must change it at the next login.
function SetPasswordModal({ name, busy, onConfirm, onClose }: SetPasswordModalProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const { formRef, errorFor, blur, validate } = useFormValidation({
    password: password ? undefined : REQUIRED,
    repeat: !repeat ? REQUIRED : repeat !== password ? "admin.userDetails.passwordMismatch" : undefined,
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    onConfirm(password);
  };

  return (
    <Modal onClose={onClose}>
      <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t("admin.userDetails.passwordTitle")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("admin.userDetails.passwordText", { name })}</p>
        </div>
        <FormField label={t("admin.userDetails.newPassword")} icon={Lock} required error={errorFor("password")}>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={blur("password")}
            className={inputStyle}
          />
        </FormField>
        <FormField label={t("admin.userDetails.confirmPassword")} icon={Lock} required error={errorFor("repeat")}>
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            onBlur={blur("repeat")}
            className={inputStyle}
          />
        </FormField>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">{t("auth.passwordHint")}</p>
          <RequiredHint />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t("admin.common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="cursor-pointer rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
          >
            {t("admin.userDetails.savePassword")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default SetPasswordModal;
