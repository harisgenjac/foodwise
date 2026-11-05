import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CircleCheck, Mail } from "lucide-react";
import api from "../api/axios.js";
import AuthLayout from "../components/AuthLayout.js";
import FormField, { inputStyle } from "../components/form/FormField.js";
import { useFormValidation } from "../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../utils/validation.js";

// "Forgot password?": the user enters their email and the server sends a link to set a new
// password. The answer is the same whether the account exists or not.
function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const { formRef, errorFor, blur, validate } = useFormValidation({
    email: isBlank(email) ? REQUIRED : undefined,
  });

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending || !validate()) return;
    setSending(true);
    setError("");
    try {
      const response = await api.post("/auth/forgot-password", { email });
      setSentMessage(response.data.message);
    } catch (err) {
      setError((axios.isAxiosError(err) && err.response?.data?.error) || t("auth.forgot.error"));
    } finally {
      setSending(false);
    }
  };

  const backToLogin = (
    <Link
      to="/login"
      className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" />
      {t("auth.forgot.backToLogin")}
    </Link>
  );

  if (sentMessage) {
    return (
      <AuthLayout title={t("auth.forgot.title")}>
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          {sentMessage}
        </p>
        <p className="mt-4 text-sm text-gray-500">{t("auth.forgot.checkInbox")}</p>
        {backToLogin}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")}>
      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
      <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label={t("auth.email")} icon={Mail} required error={errorFor("email")}>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={blur("email")}
            className={inputStyle}
          />
        </FormField>
        <button
          type="submit"
          disabled={sending}
          className="mt-2 inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-orange-500 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-60"
        >
          {t("auth.forgot.submit")}
        </button>
      </form>
      {backToLogin}
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
