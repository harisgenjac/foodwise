import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext.js";
import { useTranslation } from "react-i18next";
import { CircleCheck, Info, Lock, Mail } from "lucide-react";
import AuthLayout from "../components/AuthLayout.js";
import FormField, { inputStyle } from "../components/form/FormField.js";
import RequiredHint from "../components/form/RequiredHint.js";
import { useFormValidation } from "../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../utils/validation.js";

// What another page can pass to the login page in the navigation state.
export interface LoginState {
  // Someone opened /register, which is closed for store and restaurant accounts.
  registrationClosed?: boolean;
  // The password was just set with an emailed link.
  passwordReset?: boolean;
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { formRef, errorFor, blur, validate } = useFormValidation({
    email: isBlank(email) ? REQUIRED : undefined,
    password: password ? undefined : REQUIRED,
  });
  const state = (location.state as LoginState | null) ?? {};

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      // A blocked account gets the server's message with the admin's reason, and too many failed
      // attempts (429) the server's "try again later".
      const response = axios.isAxiosError(err) ? err.response : undefined;
      if (response?.status === 403) setError(response.data?.error || t("auth.accountBlocked"));
      else if (response?.status === 429) setError(response.data?.error || t("auth.loginError"));
      else setError(t("auth.loginError"));
    }
  };

  return (
    <AuthLayout title={t("auth.welcomeBack")} subtitle={t("auth.loginSubtitle")}>
      {state.registrationClosed && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {t("auth.registrationClosed")}
        </p>
      )}

      {state.passwordReset && !error && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          {t("auth.reset.done")}
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
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
        <div>
          <FormField label={t("auth.password")} icon={Lock} required error={errorFor("password")}>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={blur("password")}
              className={inputStyle}
            />
          </FormField>
          <div className="mt-1 flex justify-end">
            {/* 44 px high on phones, so it is easy to tap. */}
            <Link
              to="/forgot-password"
              className="inline-flex min-h-11 items-center text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline md:min-h-0"
            >
              {t("auth.forgot.link")}
            </Link>
          </div>
        </div>
        <button
          type="submit"
          className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600"
        >
          {t("auth.loginButton")}
        </button>
        <RequiredHint className="text-center" />
      </form>

      <p className="text-sm text-gray-500 text-center mt-6">{t("auth.accountByAdmin")}</p>
    </AuthLayout>
  );
}

export default LoginPage;
