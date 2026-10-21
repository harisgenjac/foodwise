import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AlertCircle, KeyRound, Lock } from "lucide-react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.js";
import FormSection from "../form/FormSection.js";
import FormField, { inputStyle } from "../form/FormField.js";

const EMPTY = { current: "", next: "", repeat: "" };

// Any user changes their own password: current, new, and the new one repeated. `required` marks a
// temporary password from an admin that must be replaced before the app unlocks.
function ChangePasswordForm({ required = false }: { required?: boolean }) {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const setField = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (values.next !== values.repeat) {
      setError(t("user.passwordMismatch"));
      return;
    }
    setSaving(true);
    try {
      await api.put("/users/me/password", { current_password: values.current, new_password: values.next });
      toast.success(t("user.passwordChanged"));
      setValues(EMPTY);
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
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label={t("user.currentPassword")} icon={Lock} required>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={values.current}
                onChange={setField("current")}
                className={inputStyle}
              />
            </FormField>
            <FormField label={t("user.newPassword")} icon={Lock} required>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={values.next}
                onChange={setField("next")}
                className={inputStyle}
              />
            </FormField>
            <FormField label={t("user.repeatPassword")} icon={Lock} required>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={values.repeat}
                onChange={setField("repeat")}
                className={inputStyle}
              />
            </FormField>
          </div>
          <div className="flex justify-end">
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
