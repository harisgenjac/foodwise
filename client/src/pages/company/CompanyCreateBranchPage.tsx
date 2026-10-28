import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Building2, Eye, Info, KeyRound, Lock, Mail, MapPin, Phone, Store } from "lucide-react";
import api, { assetUrl } from "../../api/axios.js";
import FormSection from "../../components/form/FormSection.js";
import FormField, { inputStyle } from "../../components/form/FormField.js";
import RequiredHint from "../../components/form/RequiredHint.js";
import CitySelect from "../../components/form/CitySelect.js";
import ChainLabel from "../../components/store/ChainLabel.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { useCities } from "../../hooks/useCities.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import type { Company } from "../../types/index.js";

// "Nova poslovnica": the headquarters creates a branch with its business data and a login. The
// staff set their own password and enter their names at the first login. A new branch has no
// logo or description of its own, so restaurants see the company's (shown in the preview).
function CompanyCreateBranchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cities } = useCities();
  const [company, setCompany] = useState<Company | null>(null);
  const [values, setValues] = useState({ business_name: "", city_id: "", address: "", phone: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const { formRef, errorFor, blur, validate } = useFormValidation(
    Object.fromEntries(Object.entries(values).map(([field, value]) => [field, isBlank(value) ? REQUIRED : undefined])),
  );

  useEffect(() => {
    api
      .get("/company/me")
      .then((response) => setCompany(response.data.company))
      .catch((err) => console.error("Error loading company:", err));
  }, []);

  const set = (field: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    try {
      const response = await api.post("/company/branches", { ...values, city_id: Number(values.city_id) });
      toast.success(response.data.message);
      navigate(`/company/branches/${response.data.branch.id}`);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("company.createBranch.error"));
      setSaving(false);
    }
  };

  const textField = (field: keyof typeof values, label: string, icon: typeof Store, type = "text") => (
    <FormField label={label} icon={icon} required error={errorFor(field)}>
      <input
        type={type}
        value={values[field]}
        autoComplete={field === "password" ? "new-password" : field === "email" ? "off" : undefined}
        onChange={(e) => set(field)(e.target.value)}
        onBlur={blur(field)}
        className={inputStyle}
      />
    </FormField>
  );

  const cityName = cities.find((city) => String(city.id) === values.city_id)?.name;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          <Store className="h-5 w-5" strokeWidth={2} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t("company.createBranch.title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t("company.createBranch.subtitle")}</p>
        </div>
      </div>

      <form ref={formRef} noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <FormSection title={t("company.createBranch.businessSection")} icon={Building2}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">{textField("business_name", t("company.createBranch.name"), Building2)}</div>
              <FormField label={t("cities.label")} icon={MapPin} required error={errorFor("city_id")}>
                <CitySelect
                  value={values.city_id}
                  onChange={set("city_id")}
                  emptyLabel={t("cities.choose")}
                  onBlur={blur("city_id")}
                  className={inputStyle}
                />
              </FormField>
              {textField("phone", t("user.phone"), Phone)}
              <div className="sm:col-span-2">{textField("address", t("user.address"), MapPin)}</div>
            </div>
          </FormSection>

          <FormSection title={t("company.createBranch.loginSection")} icon={KeyRound}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {textField("email", t("company.createBranch.email"), Mail, "email")}
              {textField("password", t("company.createBranch.password"), Lock)}
            </div>
            <p className="mt-2 text-xs text-gray-500">{t("company.createBranch.passwordHint")}</p>
          </FormSection>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <Eye className="h-3.5 w-3.5" />
              {t("company.createBranch.preview")}
            </p>
            <div
              inert
              aria-hidden="true"
              data-testid="branch-preview"
              className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-orange-100 text-orange-700">
                {company?.logo_url ? (
                  <img src={assetUrl(company.logo_url)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-6 w-6" />
                )}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="truncate font-bold text-gray-800">
                  {values.business_name || t("company.createBranch.previewName")}
                </p>
                {cityName && (
                  <p className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {cityName}
                  </p>
                )}
                <ChainLabel company={company?.name} />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-5 text-sm text-orange-900">
            <p className="flex items-center gap-2 font-semibold">
              <Info className="h-4 w-4" />
              {t("company.createBranch.infoTitle")}
            </p>
            <p className="mt-2">{t("company.createBranch.infoText")}</p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full cursor-pointer rounded-xl bg-orange-500 px-8 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-60"
          >
            {t("company.createBranch.submit")}
          </button>
          <RequiredHint className="text-center" />
          <Link
            to="/company/branches"
            className="block rounded-xl border border-gray-200 bg-white px-8 py-2.5 text-center font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t("admin.common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}

export default CompanyCreateBranchPage;
