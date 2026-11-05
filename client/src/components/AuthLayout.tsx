import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher.js";
import Footer from "./Footer.js";
import logo from "../assets/logoApp.png";

// The frame of the pages without a session (login, forgot password, set a password): the photo
// panel on large screens, the language switch, one card with the title, and the footer.
function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { t } = useTranslation();
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

      <div className="relative flex flex-1 flex-col bg-gray-50 px-4 pt-12 pb-6">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>

        <div className="flex flex-1 items-center justify-center pb-12">
          <div className="w-full max-w-md">
            <div className="flex items-center justify-center gap-2 mb-6 lg:hidden">
              <img src={logo} alt="Logo" className="h-14 w-14" />
              <span className="font-bold text-2xl">FoodWise</span>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
              <h1 className="text-2xl font-bold text-gray-800 mb-1">{title}</h1>
              {subtitle && <p className="text-sm text-gray-500 mb-6">{subtitle}</p>}
              {children}
            </div>
          </div>
        </div>

        {/* The impact counter needs a login. */}
        <Footer showImpact={false} />
      </div>
    </div>
  );
}

export default AuthLayout;
