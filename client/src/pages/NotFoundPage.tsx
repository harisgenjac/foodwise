import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SearchX } from "lucide-react";
import { useAuth } from "../context/AuthContext.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import LanguageSwitcher from "../components/LanguageSwitcher.js";
import logo from "../assets/logoApp.png";

// Any address without a route. Rendered outside the Layout, so it works logged in or out: the
// button leads to the dashboard, or to the login page for a visitor who is not logged in.
function NotFoundPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <Link to={user ? "/dashboard" : "/login"} className="flex items-center gap-2">
          <img src={logo} alt="FoodWise" className="h-10 w-10 object-contain" />
          <span className="text-xl font-bold tracking-tight text-gray-900">
            Food<span className="text-orange-600">Wise</span>
          </span>
        </Link>
        <LanguageSwitcher />
      </div>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <SearchX className="h-7 w-7" strokeWidth={1.8} />
          </span>
          <p className="text-sm font-semibold text-orange-600">{t("notFound.code")}</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{t("notFound.title")}</h1>
          <p className="mt-2 text-gray-600">{t("notFound.text")}</p>
          <Link
            to={user ? "/dashboard" : "/login"}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-500 px-5 font-semibold text-white transition-colors hover:bg-orange-600"
          >
            {t(user ? "notFound.toDashboard" : "notFound.toLogin")}
          </Link>
        </div>
      </main>
    </div>
  );
}

export default NotFoundPage;
