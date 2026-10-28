import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Building2, Info, KeyRound, Lock, Mail } from "lucide-react";
import api from "../../api/axios.js";
import FormSection from "../../components/form/FormSection.js";
import FormField, { inputStyle } from "../../components/form/FormField.js";
import RequiredHint from "../../components/form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";

// The admin creates a company together with its headquarters login (email and a temporary
// password the admin passes on); the headquarters fills in the rest after the first login.
function AdminCreateCompanyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const { formRef, errorFor, blur, validate } = useFormValidation({
    name: isBlank(name) ? REQUIRED : undefined,
    email: isBlank(email) ? REQUIRED : undefined,
    password: password ? undefined : REQUIRED,
  });

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    try {
      const response = await api.post("/admin/companies", { name, email, password });
      toast.success(t("admin.createCompany.success"));
      navigate(`/admin/companies/${response.data.company.id}`);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("admin.createCompany.error"));
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          <Building2 className="h-5 w-5" strokeWidth={2} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t("admin.createCompany.title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t("admin.createCompany.subtitle")}</p>
        </div>
      </div>

      <form ref={formRef} noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <FormSection title={t("admin.createCompany.companySection")} icon={Building2}>
            <FormField label={t("admin.createCompany.name")} icon={Building2} required error={errorFor("name")}>
              <input
                type="text"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                onBlur={blur("name")}
                className={inputStyle}
              />
            </FormField>
          </FormSection>

          <FormSection title={t("admin.createCompany.loginSection")} icon={KeyRound}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("admin.createCompany.email")} icon={Mail} required error={errorFor("email")}>
                <input
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={blur("email")}
                  className={inputStyle}
                />
              </FormField>
              <FormField label={t("admin.createCompany.password")} icon={Lock} required error={errorFor("password")}>
                <input
                  type="text"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={blur("password")}
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
              {t("admin.createCompany.infoTitle")}
            </p>
            <p className="mt-2">{t("admin.createCompany.infoText")}</p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full cursor-pointer rounded-xl bg-orange-500 px-8 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-60"
          >
            {t("admin.createCompany.submit")}
          </button>
          <RequiredHint className="text-center" />
          <Link
            to="/admin/companies"
            className="block rounded-xl border border-gray-200 bg-white px-8 py-2.5 text-center font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t("admin.common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}

export default AdminCreateCompanyPage;
