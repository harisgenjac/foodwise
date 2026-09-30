import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher.js";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(t("auth.loginError"));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="fixed top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="max-w-md w-full mx-4 bg-white rounded-xl shadow p-8">
        <h1 className="text-2xl font-bold mb-2 text-center">
          {t("auth.welcomeBack")}
        </h1>
        <p className="text-sm text-gray-500 mb-6 text-center">
          {t("auth.loginSubtitle")}
        </p>

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            name="email"
            autoComplete="username"
            placeholder={t("auth.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder={t("auth.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-6 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 transition-colors text-white font-medium py-2 rounded-lg"
          >
            {t("auth.loginButton")}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-6">
          {t("auth.noAccount")}{" "}
          <Link
            to="/register"
            className="text-orange-600 font-medium hover:underline"
          >
            {t("auth.registerLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
