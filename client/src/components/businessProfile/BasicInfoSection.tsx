import { useEffect, useMemo, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Building2, Camera, Lock, Mail, MapPin, Phone, Trash2, UserRound } from "lucide-react";
import FormField, { inputStyle } from "../form/FormField.js";
import CitySelect from "../form/CitySelect.js";
import { LOGO_ACCEPT } from "../../hooks/useLogoPreview.js";
import { assetUrl } from "../../api/axios.js";
import { HintTip, Switch } from "./ui.js";
import type { ProfileDraft, ProfileErrors } from "./draft.js";

const LOGO_TYPES = LOGO_ACCEPT.split(",");

interface BasicInfoSectionProps {
  draft: ProfileDraft;
  update: (change: Partial<ProfileDraft>) => void;
  errors: ProfileErrors;
  email: string;
  isStore: boolean;
  isBranch: boolean;
  // The saved logo, and a branch's company logo and description shown while it has none.
  logoUrl: string;
  companyLogoUrl: string;
  companyDescription: string;
}

// "Osnovne informacije": the logo with its camera button (a new one is uploaded, or the old one
// removed, on save), the business and personal fields, the read-only email, "O nama" and the email
// notifications switch. A branch's name and city are its company's, so they are read-only.
function BasicInfoSection({
  draft,
  update,
  errors,
  email,
  isStore,
  isBranch,
  logoUrl,
  companyLogoUrl,
  companyDescription,
}: BasicInfoSectionProps) {
  const { t } = useTranslation();
  const errorFor = (field: string) => (errors[field] ? t(errors[field]!) : undefined);

  const preview = useMemo(() => (draft.logoFile ? URL.createObjectURL(draft.logoFile) : null), [draft.logoFile]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const savedLogo = !draft.removeLogo && logoUrl ? assetUrl(logoUrl) : null;
  const companyLogo = isBranch && !draft.removeLogo && !logoUrl && companyLogoUrl ? assetUrl(companyLogoUrl) : null;
  const logoSrc = preview ?? savedLogo ?? companyLogo;
  const initials =
    (draft.businessName.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("") ||
      `${draft.firstName[0] ?? ""}${draft.lastName[0] ?? ""}`).toUpperCase();

  const chooseLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error(t("user.invalidImageType"));
      return;
    }
    update({ logoFile: file, removeLogo: false });
  };

  const field = (name: keyof ProfileDraft & string, value: string) => ({
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update({ [name]: event.target.value }),
    className: inputStyle,
  });

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="flex shrink-0 flex-col items-center gap-2 md:items-start">
        <div className="relative">
          <span className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl bg-brand-800 text-3xl font-extrabold text-white">
            {logoSrc ? (
              <img src={logoSrc} alt={t("profile.basic.logoAlt")} className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true">{initials}</span>
            )}
          </span>
          <label
            className="absolute -right-2 -bottom-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-[3px] border-white bg-neutral-900 text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-800"
            title={t("profile.basic.changeLogo")}
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            <input
              type="file"
              accept={LOGO_ACCEPT}
              onChange={chooseLogo}
              aria-label={t("profile.basic.changeLogo")}
              className="sr-only"
            />
          </label>
        </div>
        {(draft.logoFile || (logoUrl && !draft.removeLogo)) && (
          <button
            type="button"
            onClick={() => update(draft.logoFile ? { logoFile: null } : { removeLogo: true })}
            className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-danger-700 hover:bg-danger-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {draft.logoFile ? t("profile.basic.cancelLogo") : t("user.removeLogo")}
          </button>
        )}
        <p className="max-w-[9rem] text-center text-xs text-neutral-600 md:text-left">
          {draft.logoFile
            ? t("profile.basic.logoChosen")
            : draft.removeLogo
              ? t("profile.basic.logoRemoved")
              : companyLogo
                ? t("user.usesCompanyLogo")
                : t("profile.basic.logoHint")}
        </p>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2">
          <FormField label={t("user.businessName")} icon={Building2} required={!isBranch} error={errorFor("businessName")}>
            <input type="text" {...field("businessName", draft.businessName)} disabled={isBranch} name="businessName" />
          </FormField>
          {isBranch && <p className="mt-1.5 text-xs text-neutral-600">{t("user.managedByCompany")}</p>}
        </div>
        {/* Read-only: only an admin changes the email. */}
        <label className="block sm:col-span-2 lg:col-span-1">
          <span className="mb-1.5 block text-sm font-medium text-neutral-700">{t("user.email")}</span>
          <span className="relative block">
            <Mail className="pointer-events-none absolute top-3.5 left-3 h-4 w-4 text-neutral-500 sm:top-3" strokeWidth={1.8} aria-hidden="true" />
            <input
              type="email"
              value={email}
              readOnly
              className={inputStyle.replace("bg-white", "bg-neutral-100").replace("pr-3", "pr-10").replace("text-neutral-900", "text-neutral-600")}
            />
            <Lock className="pointer-events-none absolute top-3.5 right-3 h-4 w-4 text-neutral-500 sm:top-3" aria-hidden="true" />
          </span>
        </label>
        <FormField label={t("user.firstName")} icon={UserRound} required error={errorFor("firstName")}>
          <input type="text" {...field("firstName", draft.firstName)} name="firstName" />
        </FormField>
        <FormField label={t("user.lastName")} icon={UserRound} required error={errorFor("lastName")}>
          <input type="text" {...field("lastName", draft.lastName)} name="lastName" />
        </FormField>
        <FormField label={t("user.phone")} icon={Phone} required error={errorFor("phone")}>
          <input type="tel" {...field("phone", draft.phone)} name="phone" />
        </FormField>
        <div>
          <FormField label={t("cities.label")} icon={MapPin} required={!isBranch} error={errorFor("city")}>
            <CitySelect
              value={draft.cityId}
              onChange={(cityId) => update({ cityId })}
              emptyLabel={t("cities.choose")}
              disabled={isBranch}
              name="city"
              className={inputStyle}
            />
          </FormField>
          {isBranch && <p className="mt-1.5 text-xs text-neutral-600">{t("user.managedByCompany")}</p>}
        </div>
        <div className="sm:col-span-2 lg:col-span-2">
          <FormField label={t("user.address")} icon={MapPin} required error={errorFor("address")}>
            <input type="text" {...field("address", draft.address)} name="address" />
          </FormField>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <FormField label={t("profile.basic.about")}>
            <textarea
              {...field("description", draft.description)}
              rows={3}
              placeholder={isBranch ? companyDescription : undefined}
              className={`${inputStyle.replace("pl-10", "pl-3")} resize-y`}
            />
          </FormField>
          {isBranch && <p className="mt-1.5 text-xs text-neutral-600">{t("user.companyDescriptionHint")}</p>}
        </div>
        <div id="email-notifications" className="flex scroll-mt-6 items-center justify-center gap-2 sm:col-span-2 lg:col-span-3">
          <span id="email-notifications-label" className="text-sm font-semibold text-neutral-900">
            {t("profile.basic.emailNotifications")}
          </span>
          <HintTip
            label={t("profile.basic.emailNotificationsInfo")}
            text={t(isStore ? "profile.basic.emailTipStore" : "profile.basic.emailTipRestaurant")}
          />
          <Switch
            checked={draft.emailNotifications}
            onChange={(emailNotifications) => update({ emailNotifications })}
            label={t("profile.basic.emailNotifications")}
            testId="email-notifications-switch"
          />
        </div>
      </div>
    </div>
  );
}

export default BasicInfoSection;
