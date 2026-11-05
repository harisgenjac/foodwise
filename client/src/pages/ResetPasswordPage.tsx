import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Lock, TriangleAlert } from "lucide-react";
import api from "../api/axios.js";
import AuthLayout from "../components/AuthLayout.js";
import FormField, { inputStyle } from "../components/form/FormField.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import { useAuth } from "../context/AuthContext.js";
import { useFormValidation } from "../hooks/useFormValidation.js";
import { REQUIRED } from "../utils/validation.js";
import type { LoginState } from "./LoginPage.js";

type LinkState = "checking" | "valid" | "invalid";

// Opened from the emailed link (/reset-password?token=...): checks the link first, then asks for
// the new password twice. Afterwards every session of the account is signed out, and the user
// logs in again.
function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [values, setValues] = useState({ next: "", repeat: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { formRef, errorFor, blur, validate } = useFormValidation({
    next: values.next ? undefined : REQUIRED,
    repeat: !values.repeat ? REQUIRED : values.repeat !== values.next ? "user.passwordMismatch" : undefined,
  });

  useEffect(() => {
    if (!token) {
      setLinkState("invalid");
      return;
    }
    api
      .post("/auth/reset-password/check", { token })
      .then(() => setLinkState("valid"))
      .catch(() => setLinkState("invalid"));
  }, [token]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, password: values.next });
      // The server ended every session, this browser's too: forget the user here as well.
      await refreshUser().catch(() => undefined);
      navigate("/login", { replace: true, state: { passwordReset: true } satisfies LoginState });
    } catch (err) {
      const response = axios.isAxiosError(err) ? err.response : undefined;
      // The link stopped working in the meantime (used, replaced or expired).
      if (response?.data?.code === "INVALID_LINK") setLinkState("invalid");
      setError(response?.data?.error || t("auth.reset.error"));
      setSaving(false);
    }
  };

  const setField = (field: "next" | "repeat") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [field]: e.target.value }));

  if (linkState === "checking") {
    return (
      <AuthLayout title={t("auth.reset.title")}>
        <LoadingSpinner />
      </AuthLayout>
    );
  }

  if (linkState === "invalid") {
    return (
      <AuthLayout title={t("auth.reset.invalidTitle")}>
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {t("auth.reset.invalidText")}
        </p>
        <Link
          to="/forgot-password"
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-orange-500 py-2.5 font-semibold text-white hover:bg-orange-600"
        >
          {t("auth.reset.newLink")}
        </Link>
        <Link
          to="/login"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("auth.forgot.backToLogin")}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth.reset.title")} subtitle={t("auth.reset.subtitle")}>
      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
      <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        <p className="-mt-2 text-xs text-gray-500">{t("auth.passwordHint")}</p>
        <button
          type="submit"
          disabled={saving}
          className="mt-2 inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-orange-500 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-60"
        >
          {t("auth.reset.submit")}
        </button>
      </form>
    </AuthLayout>
  );
}

export default ResetPasswordPage;
