import { useState, useEffect } from "react";
import api, { apiErrorMessage, assetUrl } from "../api/axios.js";
import type { User } from "../types/index.js";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Building2, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext.js";
import BusinessProfilePage from "./BusinessProfilePage.js";
import FormSection from "../components/form/FormSection.js";
import FormField, { inputStyle } from "../components/form/FormField.js";
import RequiredHint from "../components/form/RequiredHint.js";
import { useFormValidation } from "../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../utils/validation.js";
import ChangePasswordForm from "../components/profile/ChangePasswordForm.js";
import EmailNotificationsSection from "../components/profile/EmailNotificationsSection.js";

// My profile of a company headquarters login and an admin (restaurants and stores have their own
// page, BusinessProfilePage; these two get theirs later): the name (and a headquarters login's
// phone), the email notifications switch and the password.
function AccountProfilePage() {
  const { user, refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  // Null until the profile is loaded, so the switch starts from the saved value.
  const [emailNotifications, setEmailNotifications] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    api
      .get("/users/me")
      .then((response) => {
        const data: User = response.data.user;
        setEmail(data.email);
        setRole(data.role);
        setFirstName(data.first_name || "");
        setLastName(data.last_name || "");
        setPhone(data.phone || "");
        setCompanyName(data.company_name || "");
        setLogoUrl(data.logo_url || "");
        setEmailNotifications(data.email_notifications ?? true);
      })
      .catch((err) => console.error("Error fetching profile:", err));
  }, []);

  const isCompany = role === "COMPANY";
  const { formRef, errorFor, blur, validate } = useFormValidation({
    firstName: isBlank(firstName) ? REQUIRED : undefined,
    lastName: isBlank(lastName) ? REQUIRED : undefined,
    ...(isCompany && { phone: isBlank(phone) ? REQUIRED : undefined }),
  });

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await api.put(
        "/users/me",
        isCompany ? { first_name: firstName, last_name: lastName, phone } : { first_name: firstName, last_name: lastName },
      );
      refreshUser().catch((err) => console.error("Error refreshing user:", err));
      toast.success(t("user.editedSuccess"));
    } catch (err) {
      console.error("Error updating user:", err);
      toast.error(apiErrorMessage(err) || t("user.editError"));
    } finally {
      setSaving(false);
    }
  };

  const RoleIcon = isCompany ? Building2 : ShieldCheck;
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <section className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-sm">
        <div className="relative h-28 bg-linear-to-br from-brand-50 via-warning-50/60 to-white sm:h-36">
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-brand-200/30 blur-3xl" />
        </div>
        <div className="flex flex-col gap-5 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="-mt-14 shrink-0">
            <span className="relative block h-28 w-28 overflow-hidden rounded-2xl border-4 border-white bg-brand-100 shadow-md">
              {logoUrl ? (
                <img src={assetUrl(logoUrl)} alt={initials} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-brand-800">{initials}</span>
              )}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-neutral-900">
              {`${firstName} ${lastName}`.trim() || email}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-500">
              {role && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
                  <RoleIcon className="h-3.5 w-3.5" />
                  {isCompany ? t("user.companyRole") : t("user.adminRole")}
                </span>
              )}
              {isCompany && companyName && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {companyName}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4" />
                {email}
              </span>
            </div>
          </div>
        </div>
      </section>

      <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-6">
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

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <RequiredHint />
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-brand-800 px-8 py-2.5 font-semibold text-white shadow-sm shadow-brand-800/20 transition-all hover:-translate-y-0.5 hover:bg-brand-900 hover:shadow-md disabled:translate-y-0 disabled:opacity-60 sm:w-auto cursor-pointer"
          >
            {t("user.saveButton")}
          </button>
        </div>
      </form>

      {emailNotifications !== null && <EmailNotificationsSection initial={emailNotifications} />}

      <ChangePasswordForm required={Boolean(user?.must_change_password)} />
    </div>
  );
}

// /my-profile: restaurants and stores (branches included) get the redesigned page.
function MyProfilePage() {
  const { user } = useAuth();
  if (user?.role === "STORE" || user?.role === "RESTAURANT") return <BusinessProfilePage />;
  return <AccountProfilePage />;
}

export default MyProfilePage;
