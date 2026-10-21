import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, KeyRound, UserRoundPen } from "lucide-react";
import { useAuth } from "../context/AuthContext.js";
import { getAccountSetup } from "../utils/accountSetup.js";

// Until the user has replaced an admin's temporary password and filled in the required profile
// details, every page except My profile is blurred behind this dialog (the header stays usable
// for My profile and logout). On My profile a strip lists what is still missing.
function AccountSetupGate() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { needsPassword, missingFields, locked } = getAccountSetup(user);

  if (!locked) return null;

  const fieldLabels = missingFields.map((field) => {
    const key = { first_name: "firstName", last_name: "lastName", business_name: "businessName" }[field as string] ?? field;
    return t(`user.${key}`);
  });
  const steps = [
    ...(needsPassword ? [{ icon: KeyRound, text: t("accountSetup.needsPassword") }] : []),
    ...(fieldLabels.length > 0
      ? [{ icon: UserRoundPen, text: t("accountSetup.missingFields", { fields: fieldLabels.join(", ") }) }]
      : []),
  ];

  const stepList = (
    <ul className="space-y-2">
      {steps.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-start gap-2 text-sm">
          <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );

  if (pathname === "/my-profile") {
    return (
      <div className="mx-auto mb-6 max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="font-semibold">{t("accountSetup.title")}</p>
        <div className="mt-2">{stepList}</div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-800">
          <Check className="h-3.5 w-3.5" />
          {t("accountSetup.profileHint")}
        </p>
      </div>
    );
  }

  return (
    // Below the sticky header (h-16), so its profile dropdown stays reachable.
    <div className="fixed inset-x-0 bottom-0 top-16 z-40 flex items-center justify-center bg-white/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-setup-title"
        className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-xl"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <UserRoundPen className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <h2 id="account-setup-title" className="mt-4 text-xl font-bold text-gray-900">
          {t("accountSetup.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{t("accountSetup.text")}</p>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 text-gray-800">{stepList}</div>
        <Link
          to="/my-profile"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600"
        >
          {t("accountSetup.goToProfile")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export default AccountSetupGate;
