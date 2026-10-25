import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AlertCircle, KeyRound, Lock } from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.js";
import FormSection from "../form/FormSection.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { REQUIRED } from "../../utils/validation.js";

const EMPTY = { current: "", next: "", repeat: "" };

// Any user changes their own password: current, new, and the new one repeated. `required` marks a
// temporary password from an admin that must be replaced before the app unlocks.
function ChangePasswordForm({ required = false }: { required?: boolean }) {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { formRef, errorFor, blur, validate, reset } = useFormValidation({
    current: values.current ? undefined : REQUIRED,
    next: values.next ? undefined : REQUIRED,
    repeat: !values.repeat ? REQUIRED : values.repeat !== values.next ? "user.passwordMismatch" : undefined,
  });

  const setField = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    try {
      await api.put("/users/me/password", { current_password: values.current, new_password: values.next });
      toast.success(t("user.passwordChanged"));
      setValues(EMPTY);
      reset();
      refreshUser().catch((err) => console.error("Error refreshing user:", err));
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(message || t("user.passwordError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={required ? "rounded-2xl ring-2 ring-amber-300" : undefined}>
      <FormSection
        title={t("user.passwordSection")}
        icon={KeyRound}
        description={required ? t("user.passwordSectionRequired") : t("auth.passwordHint")}
      >
        <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label={t("user.currentPassword")} icon={Lock} required error={errorFor("current")}>
              <input
                type="password"
                autoComplete="current-password"
                value={values.current}
                onChange={setField("current")}
                onBlur={blur("current")}
                className={inputStyle}
              />
            </FormField>
            <FormField label={t("user.newPassword")} icon={Lock} required error={errorFor("next")}>
              <input
                type="password"
                autoComplete="new-password"
                value={values.next}
                onChange={setField("next")}
                onBlur={blur("next")}
                className={inputStyle}
              />
            </FormField>
            <FormField label={t("user.repeatPassword")} icon={Lock} required error={errorFor("repeat")}>
              <input
                type="password"
                autoComplete="new-password"
                value={values.repeat}
                onChange={setField("repeat")}
                onBlur={blur("repeat")}
                className={inputStyle}
              />
            </FormField>
          </div>
          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <RequiredHint />
            <button
              type="submit"
              disabled={saving}
              className="w-full cursor-pointer rounded-xl bg-orange-500 px-6 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-60 sm:w-auto"
            >
              {t("user.changePassword")}
            </button>
          </div>
        </form>
      </FormSection>
    </div>
  );
}

export default ChangePasswordForm;
