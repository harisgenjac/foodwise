import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, Info, KeyRound, Lock, Mail, ShieldCheck, Store, UserPlus, UtensilsCrossed } from "lucide-react";
import api from "../../api/axios.js";
import FormSection from "../../components/form/FormSection.js";
import FormField, { inputStyle } from "../../components/form/FormField.js";
import { ROLES } from "../../utils/admin.js";
import type { Role } from "../../types/index.js";

const ROLE_ICONS: Record<Role, LucideIcon> = {
  STORE: Store,
  RESTAURANT: UtensilsCrossed,
  ADMIN: ShieldCheck,
};

// The admin enters only the account type, email and password; the user fills in the rest
// of the profile after the first login.
function AdminCreateUserPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("STORE");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const roles = t("admin.roles", { returnObjects: true }) as Record<string, string>;
  const descriptions = t("admin.createUser.roleDescriptions", { returnObjects: true }) as Record<string, string>;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.post("/admin/users", { role, email, password });
      toast.success(t("admin.createUser.success"));
      navigate(`/admin/users/${response.data.user.id}`);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(message || t("admin.createUser.error"));
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          <UserPlus className="h-5 w-5" strokeWidth={2} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t("admin.createUser.title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t("admin.createUser.subtitle")}</p>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <FormSection title={t("admin.createUser.roleSection")} icon={ShieldCheck}>
            <div role="radiogroup" aria-label={t("admin.createUser.roleSection")} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {ROLES.map((code) => {
                const Icon = ROLE_ICONS[code];
                const selected = role === code;
                return (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRole(code)}
                    className={`flex cursor-pointer flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-colors ${
                      selected ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white hover:border-orange-200"
                    }`}
                  >
                    <Icon className={`h-6 w-6 ${selected ? "text-orange-600" : "text-gray-400"}`} strokeWidth={1.8} />
                    <span className="font-semibold text-gray-900">{roles[code]}</span>
                    <span className="text-xs text-gray-500">{descriptions[code]}</span>
                  </button>
                );
              })}
            </div>
          </FormSection>

          <FormSection title={t("admin.createUser.credentialsSection")} icon={KeyRound}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("admin.createUser.email")} icon={Mail}>
                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputStyle}
                />
              </FormField>
              <FormField label={t("admin.createUser.password")} icon={Lock}>
                <input
                  type="text"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputStyle}
                />
              </FormField>
            </div>
            <p className="mt-2 text-xs text-gray-500">{t("admin.createUser.passwordHint")}</p>
          </FormSection>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-5 text-sm text-orange-900">
            <p className="flex items-center gap-2 font-semibold">
              <Info className="h-4 w-4" />
              {t("admin.createUser.infoTitle")}
            </p>
            <p className="mt-2">{t("admin.createUser.infoText")}</p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full cursor-pointer rounded-xl bg-orange-500 px-8 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-60"
          >
            {t("admin.createUser.submit")}
          </button>
          <Link
            to="/admin/users"
            className="block rounded-xl border border-gray-200 bg-white px-8 py-2.5 text-center font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t("admin.common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}

export default AdminCreateUserPage;
