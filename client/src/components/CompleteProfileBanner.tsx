import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, UserRoundPen } from "lucide-react";
import { useAuth } from "../context/AuthContext.js";

// An admin creates store and restaurant accounts with only an email, so until the user adds a
// business name the marketplace hides them. Shown on every page except the profile itself.
function CompleteProfileBanner() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { pathname } = useLocation();

  if (!user || user.role === "ADMIN" || user.business_name || pathname === "/my-profile") {
    return null;
  }

  return (
    <div className="mx-auto mb-6 flex max-w-5xl flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm">
          <UserRoundPen className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div>
          <p className="font-semibold text-amber-900">{t("profileBanner.title")}</p>
          <p className="mt-0.5 text-sm text-amber-800">{t("profileBanner.text")}</p>
        </div>
      </div>
      <Link
        to="/my-profile"
        className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
      >
        {t("profileBanner.action")}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export default CompleteProfileBanner;
