import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios.js";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher.js";
import { Lock, Mail, Store, UserRound, UtensilsCrossed } from "lucide-react";
import logo from "../assets/logoApp.png";
import FormField, { inputStyle } from "../components/form/FormField.jsx";

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
      setError(t("auth.registrationError"));
    }
  };

  const labelStyle = "mb-1.5 block text-sm font-medium text-gray-700";
  const roleCardStyle =
    "flex cursor-pointer flex-col items-center gap-2 border-2 rounded-xl px-3 py-4 text-sm font-medium transition-colors";
  const activeRoleStyle = "border-orange-500 bg-orange-50 text-orange-600";
  const inactiveRoleStyle =
    "border-gray-200 text-gray-600 hover:border-orange-300 hover:bg-orange-50";

  return (
    <div className="min-h-screen flex">
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
            <img src={logo} alt="Logo" className="h-20 w-20" />
            <span className="font-bold text-3xl">FoodWise</span>
          </div>
          <h2 className="text-4xl font-bold leading-tight">
            {t("dashboard.appTitle")}
          </h2>
          <p className="mt-4 text-lg text-white/80">
            {t("dashboard.appSubtitle")}
          </p>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-gray-50 px-4 py-12">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>

        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-6 lg:hidden">
            <img src={logo} alt="Logo" className="h-14 w-14" />
            <span className="font-bold text-2xl">FoodWise</span>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-800 mb-1">
              {t("auth.createAccount")}
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              {t("auth.registrationSubtitle")}
            </p>

            {error && (
              <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputStyle}
                />
              </FormField>
              <button
                type="submit"
                className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600"
              >
                {t("auth.registerButton")}
              </button>
            </form>

            <p className="text-sm text-gray-500 text-center mt-6">
              {t("auth.alreadyHaveAccount")}{" "}
              <Link
                to="/login"
                className="text-orange-600 font-medium hover:underline"
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
