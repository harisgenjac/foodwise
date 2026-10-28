import { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Building2, Camera, FileText, Info } from "lucide-react";
import api, { assetUrl } from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.js";
import FormSection from "../../components/form/FormSection.js";
import FormField, { inputStyle } from "../../components/form/FormField.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import type { Company } from "../../types/index.js";

const errorText = (err: unknown) => (axios.isAxiosError(err) ? err.response?.data?.error : null);

// The headquarters edits its company's description and logo. The name is read-only: only an
// admin changes it.
function CompanyProfilePage() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/company/me")
      .then((response) => {
        setCompany(response.data.company);
        setDescription(response.data.company.description ?? "");
      })
      .catch((err) => console.error("Error loading company:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
    e.target.value = "";
  };

  const handleLogoCancel = () => {
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleLogoUpload = async () => {
    if (!logoFile || !company) return;
    const formData = new FormData();
    formData.append("logo", logoFile);
    try {
      const response = await api.post("/company/me/logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCompany({ ...company, logo_url: response.data.logo_url });
      handleLogoCancel();
      // The header shows the company logo as the avatar.
      refreshUser().catch((err) => console.error("Error refreshing user:", err));
      toast.success(t("user.addedLogoSuccess"));
    } catch (err) {
      console.error(err);
      toast.error(errorText(err) || t("user.uploadError"));
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const response = await api.put("/company/me", { description });
      setCompany(response.data.company);
      toast.success(response.data.message);
    } catch (err) {
      console.error("Error updating company:", err);
      toast.error(errorText(err) || t("company.profile.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!company) return <LoadErrorState />;

  const avatarSrc = logoPreview || (company.logo_url ? assetUrl(company.logo_url) : null);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="relative h-28 bg-linear-to-br from-orange-50 via-amber-50/60 to-white">
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-orange-200/30 blur-3xl" />
        </div>
        <div className="flex flex-col gap-5 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="-mt-14 shrink-0">
            <label className="group relative block h-28 w-28 cursor-pointer overflow-hidden rounded-2xl border-4 border-white bg-orange-100 shadow-md">
              {avatarSrc ? (
                <img src={avatarSrc} alt={company.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-orange-700">
                  <Building2 className="h-10 w-10" />
                </span>
              )}
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5" />
                {company.logo_url ? t("user.changeLogo") : t("user.addLogoTitle")}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                aria-label={t("company.profile.logoLabel")}
                className="hidden"
              />
            </label>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">{company.name}</h1>
            <p className="mt-1 text-sm text-gray-500">{t("company.profile.subtitle")}</p>
          </div>
          {logoFile && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleLogoCancel}
                className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {t("user.cancel")}
              </button>
              <button
                type="button"
                onClick={handleLogoUpload}
                className="cursor-pointer rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
              >
                {t("user.saveImage")}
              </button>
            </div>
          )}
        </div>
        <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">{t("user.tooltipLogoText")}</p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        <FormSection title={t("company.profile.companySection")} icon={Building2}>
          <div className="space-y-4">
            <div>
              <FormField label={t("company.profile.name")} icon={Building2}>
                <input type="text" value={company.name} disabled className={inputStyle} />
              </FormField>
              <p className="mt-1.5 flex items-start gap-2 text-xs text-gray-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t("company.profile.nameNote")}
              </p>
            </div>
            <FormField label={t("company.profile.description")} icon={FileText}>
              <textarea
                value={description}
                maxLength={1000}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className={`${inputStyle} resize-none`}
              />
            </FormField>
          </div>
        </FormSection>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="w-full cursor-pointer rounded-xl bg-orange-500 px-8 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-60 sm:w-auto"
          >
            {t("user.saveButton")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CompanyProfilePage;
