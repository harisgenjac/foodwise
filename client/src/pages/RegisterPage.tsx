import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import api, { apiErrorMessage } from "../api/axios.js";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher.js";
import { Lock, Mail, Store, UserRound, UtensilsCrossed } from "lucide-react";
import Logo from "../components/brand/Logo.js";
import { BRAND_NAME } from "../utils/brand.js";
import FormField, { inputStyle } from "../components/form/FormField.js";

function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await api.post("/auth/register", {
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        role,
      });
      navigate("/login");
    } catch (err) {
      // Validation messages from the server (taken email, short password) are more useful than a generic one.
      const message = apiErrorMessage(err);
      setError(message || t("auth.registrationError"));
    }
  };

  const labelStyle = "mb-1.5 block text-sm font-medium text-neutral-700";
  const roleCardStyle =
    "flex cursor-pointer flex-col items-center gap-2 border-2 rounded-xl px-3 py-4 text-sm font-medium transition-colors";
  const activeRoleStyle = "border-brand-800 bg-brand-50 text-brand-800";
  const inactiveRoleStyle =
    "border-neutral-200 text-neutral-600 hover:border-brand-300 hover:bg-brand-50";

  return (
    <div className="min-h-dvh flex">
      <div
        className="relative hidden lg:flex lg:w-1/2 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200')",
        }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-8">
            <Logo variant="mark" className="h-20 w-20" decorative />
            <span className="font-bold text-3xl">{BRAND_NAME}</span>
          </div>
          <h2 className="text-4xl font-bold leading-tight">
            {t("dashboard.appTitle")}
          </h2>
          <p className="mt-4 text-lg text-white/80">
            {t("dashboard.appSubtitle")}
          </p>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-neutral-50 px-4 py-12">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>

        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-6 lg:hidden">
            <Logo variant="full" className="h-14 w-14" textClassName="text-2xl" />
          </div>

          <div className="rounded-2xl border border-neutral-100 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-neutral-800 mb-1">
              {t("auth.createAccount")}
            </h1>
            <p className="text-sm text-neutral-500 mb-6">
              {t("auth.registrationSubtitle")}
            </p>

            {error && (
              <p className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <span className={labelStyle}>{t("auth.roleLabel")}</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole("STORE")}
                    className={`${roleCardStyle} ${role === "STORE" ? activeRoleStyle : inactiveRoleStyle}`}
                  >
                    <Store className="h-7 w-7" strokeWidth={1.8} />
                    {t("auth.storeRole")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("RESTAURANT")}
                    className={`${roleCardStyle} ${role === "RESTAURANT" ? activeRoleStyle : inactiveRoleStyle}`}
                  >
                    <UtensilsCrossed className="h-7 w-7" strokeWidth={1.8} />
                    {t("auth.restaurantRole")}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label={t("auth.firstName")} icon={UserRound}>
                  <input
                    id="given-name"
                    type="text"
                    name="given-name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={inputStyle}
                  />
                </FormField>
                <FormField label={t("auth.lastName")} icon={UserRound}>
                  <input
                    id="family-name"
                    type="text"
                    name="family-name"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputStyle}
                  />
                </FormField>
              </div>
              <FormField label={t("auth.email")} icon={Mail}>
                <input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputStyle}
                />
              </FormField>
              <FormField label={t("auth.password")} icon={Lock}>
                <input
                  id="password"
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputStyle}
                />
              </FormField>
              <p className="-mt-2 text-xs text-neutral-500">{t("auth.passwordHint")}</p>
              <button
                type="submit"
                className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-800 py-2.5 font-semibold text-white shadow-sm shadow-brand-800/20 transition-colors hover:bg-brand-900"
              >
                {t("auth.registerButton")}
              </button>
            </form>

            <p className="text-sm text-neutral-500 text-center mt-6">
              {t("auth.alreadyHaveAccount")}{" "}
              <Link
                to="/login"
                className="text-brand-800 font-medium hover:underline"
              >
                {t("auth.loginLink")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
