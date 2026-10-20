import { useState, useEffect } from "react";
import api, { assetUrl } from "../api/axios.js";
import type { User } from "../types/index.js";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  MapPin,
  Phone,
  Store,
  Truck,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.js";
import FormSection from "../components/form/FormSection.js";
import FormField, { inputStyle } from "../components/form/FormField.js";

function MyProfilePage() {
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [pickupHours, setPickupHours] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

  const fetchProfile = async () => {
    try {
      const response = await api.get("/users/me");
      const data: User = response.data.user;
      setEmail(data.email);
      setRole(data.role);
      setFirstName(data.first_name);
      setLastName(data.last_name);
      setBusinessName(data.business_name || "");
      setCity(data.city || "");
      setPhone(data.phone || "");
      setAddress(data.address || "");
      setOpeningHours(data.opening_hours || "");
      setPickupHours(data.pickup_hours || "");
      setDescription(data.description || "");
      setLogoUrl(data.logo_url || "");
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  useEffect(() => {
    fetchProfile();
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
    if (!logoFile) return;
    const formData = new FormData();
    formData.append("logo", logoFile);

    try {
      const response = await api.post("/users/me/logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLogoUrl(response.data.logo_url);
      setLogoFile(null);
      setLogoPreview(null);
      refreshUser().catch((err) => console.error("Error refreshing user:", err));
      setSuccess(t("user.addedLogoSuccess"));
      setError("");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null
      setError(message || t("user.uploadError"));
      setSuccess("");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/users/me", {
        first_name: firstName,
        last_name: lastName,
        business_name: businessName,
        city,
        phone,
        address,
        opening_hours: openingHours,
        pickup_hours: pickupHours,
        description,
      });
      refreshUser().catch((err) => console.error("Error refreshing user:", err));
      setSuccess(t("user.editedSuccess"));
      setError("");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Error updating user:", err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null
      setError(
        message || t("user.editError"),
      );
      setSuccess("");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  const isStore = role === "STORE";
  const RoleIcon = isStore ? Store : UtensilsCrossed;
  const avatarSrc = logoPreview || (logoUrl ? assetUrl(logoUrl) : null);
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`;
  const location = [address, city].filter(Boolean).join(", ");

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {error && (
        <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {success && (
        <p className="flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="relative h-28 bg-linear-to-br from-orange-50 via-amber-50/60 to-white">
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-orange-200/30 blur-3xl" />
        </div>

        <div className="flex flex-col gap-5 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="-mt-14 shrink-0">
            <label className="group relative block h-28 w-28 cursor-pointer overflow-hidden rounded-2xl border-4 border-white bg-orange-100 shadow-md">
              {avatarSrc ? (
                <img src={avatarSrc} alt={businessName || initials} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-orange-700">
                  {initials}
                </span>
              )}
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5" />
                {logoUrl ? t("user.changeLogo") : t("user.addLogoTitle")}
              </span>
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">
              {businessName || `${firstName} ${lastName}`}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
              {role && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                  <RoleIcon className="h-3.5 w-3.5" />
                  {isStore ? t("user.storeRole") : t("user.restaurantRole")}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4" />
                {email}
              </span>
              {location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {location}
                </span>
              )}
            </div>
          </div>

          {logoFile && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleLogoCancel}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 cursor-pointer"
              >
                {t("user.cancel")}
              </button>
              <button
                type="button"
                onClick={handleLogoUpload}
                className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 cursor-pointer"
              >
                {t("user.saveImage")}
              </button>
            </div>
          )}
        </div>
        <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">{t("user.tooltipLogoText")}</p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <FormSection title={t("user.personalSection")} icon={UserRound}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("user.firstName")} icon={UserRound}>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputStyle} />
              </FormField>
              <FormField label={t("user.lastName")} icon={UserRound}>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputStyle} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label={t("user.email")} icon={Mail}>
                  <input type="email" value={email} disabled className={inputStyle} />
                </FormField>
              </div>
            </div>
          </FormSection>

          <FormSection title={t("user.businessSection")} icon={Building2}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField label={t("user.businessName")} icon={Building2}>
                  <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputStyle} />
                </FormField>
              </div>
              <FormField label={t("user.city")} icon={MapPin}>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputStyle} />
              </FormField>
              <FormField label={t("user.phone")} icon={Phone}>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputStyle} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label={t("user.address")} icon={MapPin}>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputStyle} />
                </FormField>
              </div>
            </div>
          </FormSection>

          <FormSection title={t("user.hoursSection")} icon={Clock}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("user.workingHours")} icon={Clock}>
                <input type="text" value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} className={inputStyle} />
              </FormField>
              <FormField label={t("user.pickupHours")} icon={Truck}>
                <input type="text" value={pickupHours} onChange={(e) => setPickupHours(e.target.value)} className={inputStyle} />
              </FormField>
            </div>
          </FormSection>

          <FormSection title={t("user.aboutSection")} icon={FileText}>
            <FormField label={t("user.description")} icon={FileText}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`${inputStyle} resize-none`}
              />
            </FormField>
          </FormSection>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-orange-500 px-8 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-md disabled:translate-y-0 disabled:opacity-60 sm:w-auto cursor-pointer"
          >
            {t("user.saveButton")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default MyProfilePage;
