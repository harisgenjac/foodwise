import { useState, useEffect } from "react";
import api, { assetUrl } from "../api/axios.js";
import type { User } from "../types/index.js";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Camera,
  Clock,
  ImageIcon,
  Trash2,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Store,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.js";
import FormSection from "../components/form/FormSection.js";
import FormField, { inputStyle } from "../components/form/FormField.js";
import RequiredHint from "../components/form/RequiredHint.js";
import { useFormValidation } from "../hooks/useFormValidation.js";
import { useCities } from "../hooks/useCities.js";
import { LOGO_ACCEPT, useLogoPreview } from "../hooks/useLogoPreview.js";
import CitySelect from "../components/form/CitySelect.js";
import { isBlank, REQUIRED } from "../utils/validation.js";
import ChangePasswordForm from "../components/profile/ChangePasswordForm.js";
import SubscriptionSection from "../components/credits/SubscriptionSection.js";
import EmailNotificationsSection from "../components/profile/EmailNotificationsSection.js";
import WeeklyHoursEditor from "../components/profile/WeeklyHoursEditor.js";
import { isScheduleValid, type Schedule } from "../utils/schedule.js";
import { MAX_PRODUCT_IMAGE_MB, PRODUCT_IMAGE_TYPES } from "../utils/productImages.js";

function MyProfilePage() {
  const { user, refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [cityId, setCityId] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  // The old free-text hours: only a hint until weekly hours are entered.
  const [openingHours, setOpeningHours] = useState("");
  const [pickupHours, setPickupHours] = useState("");
  const [openingSchedule, setOpeningSchedule] = useState<Schedule | null>(null);
  const [pickupSchedule, setPickupSchedule] = useState<Schedule | null>(null);
  // A store's cover image on its store page.
  const [coverUrl, setCoverUrl] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [description, setDescription] = useState("");
  const [companyName, setCompanyName] = useState("");
  // A branch without its own logo or description shows its company's.
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  // Null until the profile is loaded, so the switch starts from the saved value.
  const [emailNotifications, setEmailNotifications] = useState<boolean | null>(null);
  const { file: logoFile, preview: logoPreview, select: selectLogo, clear: clearLogo } = useLogoPreview();
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const { cities } = useCities();

  const fetchProfile = async () => {
    try {
      const response = await api.get("/users/me");
      const data: User = response.data.user;
      setEmail(data.email);
      setRole(data.role);
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setBusinessName(data.business_name || "");
      setCityId(data.city_id ? String(data.city_id) : "");
      setPhone(data.phone || "");
      setAddress(data.address || "");
      setOpeningHours(data.opening_hours || "");
      setPickupHours(data.pickup_hours || "");
      setOpeningSchedule(data.opening_schedule ?? null);
      setPickupSchedule(data.pickup_schedule ?? null);
      setCoverUrl(data.cover_url || "");
      setDescription(data.description || "");
      setCompanyName(data.company_name || "");
      setCompanyLogoUrl(data.company_logo_url || "");
      setCompanyDescription(data.company_description || "");
      setLogoUrl(data.logo_url || "");
      setEmailNotifications(data.email_notifications ?? true);
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && !selectLogo(file)) toast.error(t("user.invalidImageType"));
    e.target.value = "";
  };

  const handleLogoCancel = clearLogo;

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    const formData = new FormData();
    formData.append("logo", logoFile);

    try {
      const response = await api.post("/users/me/logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLogoUrl(response.data.logo_url);
      clearLogo();
      refreshUser().catch((err) => console.error("Error refreshing user:", err));
      toast.success(t("user.addedLogoSuccess"));
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("user.uploadError"));
    }
  };

  // Removes the own logo; a branch then shows its company's again.
  const handleLogoRemove = async () => {
    try {
      const response = await api.delete("/users/me/logo");
      setLogoUrl("");
      refreshUser().catch((err) => console.error("Error refreshing user:", err));
      toast.success(response.data.message);
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("user.uploadError"));
    }
  };

  // The cover is uploaded as soon as it is chosen (same rules as product images).
  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!PRODUCT_IMAGE_TYPES.includes(file.type)) {
      toast.error(t("productImage.invalidType"));
      return;
    }
    if (file.size > MAX_PRODUCT_IMAGE_MB * 1024 * 1024) {
      toast.error(t("productImage.tooLarge"));
      return;
    }
    setCoverBusy(true);
    try {
      const formData = new FormData();
      formData.append("cover", file);
      const response = await api.post("/users/me/cover", formData);
      setCoverUrl(response.data.cover_url);
      toast.success(t("cover.saved"));
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("user.uploadError"));
    } finally {
      setCoverBusy(false);
    }
  };

  const handleCoverRemove = async () => {
    setCoverBusy(true);
    try {
      const response = await api.delete("/users/me/cover");
      setCoverUrl("");
      toast.success(response.data.message);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("user.uploadError"));
    } finally {
      setCoverBusy(false);
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    if (!isScheduleValid(openingSchedule) || !isScheduleValid(pickupSchedule)) {
      toast.error(t("schedule.invalid"));
      return;
    }
    setSaving(true);
    try {
      await api.put("/users/me", isAdmin ? { first_name: firstName, last_name: lastName } : isCompany ? {
        first_name: firstName,
        last_name: lastName,
        phone,
      } : {
        first_name: firstName,
        last_name: lastName,
        // A branch's name and city are managed by its company (the server ignores them).
        ...(!isBranch && { business_name: businessName, city_id: Number(cityId) }),
        phone,
        address,
        // Weekly hours are sent once entered (until then the stored ones stay as they are).
        ...(openingSchedule && { opening_schedule: openingSchedule }),
        ...(isStore && pickupSchedule && { pickup_schedule: pickupSchedule }),
        description,
      });
      refreshUser().catch((err) => console.error("Error refreshing user:", err));
      toast.success(t("user.editedSuccess"));
    } catch (err) {
      console.error("Error updating user:", err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("user.editError"));
    } finally {
      setSaving(false);
    }
  };

  const isStore = role === "STORE";
  // An admin has no business profile or logo, only a name. A company headquarters login has a
  // name and a phone; its company's data and logo are on the company profile page.
  const isAdmin = role === "ADMIN";
  const isCompany = role === "COMPANY";
  const hasBusinessProfile = !isAdmin && !isCompany;
  // A store of a company: its headquarters (or an admin) sets the name and the city.
  const isBranch = isStore && Boolean(companyName);
  const RoleIcon = isAdmin ? ShieldCheck : isCompany ? Building2 : isStore ? Store : UtensilsCrossed;
  const roleLabel = isAdmin
    ? t("user.adminRole")
    : isCompany
      ? t("user.companyRole")
      : isStore
        ? t("user.storeRole")
        : t("user.restaurantRole");
  // The server's required fields; an admin has only a name.
  const requiredValues = {
    firstName,
    lastName,
    ...(isCompany && { phone }),
    ...(hasBusinessProfile && { phone, address }),
    ...(hasBusinessProfile && !isBranch && { businessName, city: cityId }),
  };
  const { formRef, errorFor, blur, validate } = useFormValidation(
    Object.fromEntries(
      Object.entries(requiredValues).map(([field, value]) => [field, isBlank(value) ? REQUIRED : undefined]),
    ),
  );
  const usesCompanyLogo = isBranch && !logoUrl && !logoPreview && Boolean(companyLogoUrl);
  const avatarSrc =
    logoPreview || (logoUrl ? assetUrl(logoUrl) : usesCompanyLogo ? assetUrl(companyLogoUrl) : null);
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`;
  const cityName = cities.find((city) => String(city.id) === cityId)?.name;
  const location = [address, cityName].filter(Boolean).join(", ");

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="relative h-28 bg-linear-to-br from-orange-50 via-amber-50/60 to-white sm:h-36">
          {isStore && coverUrl ? (
            <img src={assetUrl(coverUrl)} alt={t("cover.alt")} className="h-full w-full object-cover" />
          ) : (
            <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-orange-200/30 blur-3xl" />
          )}
          {isStore && (
            // The store page's cover: uploaded at once, removable.
            <div className="absolute top-3 right-3 flex gap-2">
              <label
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-white/90 px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-white sm:min-h-0 sm:py-1.5 ${coverBusy ? "pointer-events-none opacity-60" : ""}`}
              >
                <ImageIcon className="h-4 w-4" />
                {coverUrl ? t("cover.change") : t("cover.add")}
                <input
                  type="file"
                  accept={PRODUCT_IMAGE_TYPES.join(",")}
                  onChange={handleCoverChange}
                  disabled={coverBusy}
                  aria-label={t("cover.upload")}
                  className="hidden"
                />
              </label>
              {coverUrl && (
                <button
                  type="button"
                  onClick={handleCoverRemove}
                  disabled={coverBusy}
                  aria-label={t("cover.remove")}
                  title={t("cover.remove")}
                  className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl bg-white/90 text-red-600 shadow-sm hover:bg-white disabled:opacity-60 sm:min-h-0 sm:min-w-0 sm:p-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
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
              <span className={`absolute inset-0 ${hasBusinessProfile ? "flex" : "hidden"} flex-col items-center justify-center gap-1 bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100`}>
                <Camera className="h-5 w-5" />
                {logoUrl ? t("user.changeLogo") : t("user.addLogoTitle")}
              </span>
              <input type="file" accept={LOGO_ACCEPT} onChange={handleLogoChange} disabled={!hasBusinessProfile} className="hidden" />
            </label>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">
              {businessName || `${firstName} ${lastName}`.trim() || email}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
              {role && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                  <RoleIcon className="h-3.5 w-3.5" />
                  {roleLabel}
                </span>
              )}
              {(isCompany || isBranch) && companyName && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {companyName}
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

          {!logoFile && hasBusinessProfile && logoUrl && (
            <button
              type="button"
              onClick={handleLogoRemove}
              className="shrink-0 cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {t("user.removeLogo")}
            </button>
          )}
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
        {hasBusinessProfile && (
          <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">
            {usesCompanyLogo ? `${t("user.usesCompanyLogo")} ` : ""}
            {t("user.tooltipLogoText")}
            {isStore && ` ${t("cover.hint")}`}
          </p>
        )}
      </section>

      <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <FormSection title={t("user.personalSection")} icon={UserRound}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={t("user.firstName")} icon={UserRound} required error={errorFor("firstName")}>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={blur("firstName")}
                  className={inputStyle}
                />
              </FormField>
              <FormField label={t("user.lastName")} icon={UserRound} required error={errorFor("lastName")}>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={blur("lastName")}
                  className={inputStyle}
                />
              </FormField>
              {isCompany && (
                <div className="sm:col-span-2">
                  <FormField label={t("user.phone")} icon={Phone} required error={errorFor("phone")}>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onBlur={blur("phone")}
                      className={inputStyle}
                    />
                  </FormField>
                </div>
              )}
              <div className="sm:col-span-2">
                <FormField label={t("user.email")} icon={Mail}>
                  <input type="email" value={email} disabled className={inputStyle} />
                </FormField>
              </div>
            </div>
          </FormSection>

          {hasBusinessProfile && (
          <>
          <FormSection title={t("user.businessSection")} icon={Building2}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField
                  label={t("user.businessName")}
                  icon={Building2}
                  required={!isBranch}
                  error={errorFor("businessName")}
                >
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    onBlur={blur("businessName")}
                    disabled={isBranch}
                    className={inputStyle}
                  />
                </FormField>
                {isBranch && <p className="mt-1.5 text-xs text-gray-500">{t("user.managedByCompany")}</p>}
              </div>
              <div>
                <FormField label={t("cities.label")} icon={MapPin} required={!isBranch} error={errorFor("city")}>
                  <CitySelect
                    value={cityId}
                    onChange={setCityId}
                    emptyLabel={t("cities.choose")}
                    onBlur={blur("city")}
                    disabled={isBranch}
                    className={inputStyle}
                  />
                </FormField>
                {isBranch && <p className="mt-1.5 text-xs text-gray-500">{t("user.managedByCompany")}</p>}
              </div>
              <FormField label={t("user.phone")} icon={Phone} required error={errorFor("phone")}>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={blur("phone")}
                  className={inputStyle}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label={t("user.address")} icon={MapPin} required error={errorFor("address")}>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onBlur={blur("address")}
                    className={inputStyle}
                  />
                </FormField>
              </div>
            </div>
          </FormSection>

          <FormSection title={t("user.hoursSection")} icon={Clock}>
            <div className="space-y-6">
              <WeeklyHoursEditor
                label={t("user.workingHours")}
                value={openingSchedule}
                onChange={setOpeningSchedule}
                legacyText={openingHours}
              />
              {/* Only a store hands food over, so only a store has pickup hours. */}
              {isStore && (
                <WeeklyHoursEditor
                  label={t("user.pickupHours")}
                  value={pickupSchedule}
                  onChange={setPickupSchedule}
                  legacyText={pickupHours}
                />
              )}
            </div>
          </FormSection>

          <FormSection title={t("user.aboutSection")} icon={FileText}>
            <FormField label={t("user.description")} icon={FileText}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={isBranch ? companyDescription : undefined}
                className={`${inputStyle} resize-none`}
              />
            </FormField>
            {isBranch && <p className="mt-1.5 text-xs text-gray-500">{t("user.companyDescriptionHint")}</p>}
          </FormSection>
          </>
          )}
        </div>

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <RequiredHint />
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-orange-500 px-8 py-2.5 font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-md disabled:translate-y-0 disabled:opacity-60 sm:w-auto cursor-pointer"
          >
            {t("user.saveButton")}
          </button>
        </div>
      </form>

      {emailNotifications !== null && <EmailNotificationsSection initial={emailNotifications} />}

      {/* Plans, top-ups and requests for stores and restaurants; shown once credits are loaded. */}
      {role === "STORE" && <SubscriptionSection />}

      <ChangePasswordForm required={Boolean(user?.must_change_password)} />
    </div>
  );
}

export default MyProfilePage;
