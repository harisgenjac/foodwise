import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Info, Lock } from "lucide-react";
import FormField, { inputStyle } from "../form/FormField.js";
import type { PasswordDraft, ProfileErrors } from "./draft.js";

const FIELDS = [
  { name: "current", label: "user.currentPassword", autoComplete: "current-password" },
  { name: "next", label: "user.newPassword", autoComplete: "new-password" },
  { name: "repeat", label: "user.repeatPassword", autoComplete: "new-password" },
] as const;

interface PasswordSectionProps {
  value: PasswordDraft;
  onChange: (value: PasswordDraft) => void;
  errors: ProfileErrors;
  // A temporary password must be replaced: the fields cannot stay empty.
  required: boolean;
}

// "Promjena lozinke": the current password, the new one and the new one again, each with a show /
// hide button. All empty: the password stays; once one is filled, all three are needed (checked
// on save, the current one by the server).
function PasswordSection({ value, onChange, errors, required }: PasswordSectionProps) {
  const { t } = useTranslation();
  const [shown, setShown] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-3">
      {required && (
        <p className="rounded-xl bg-warning-50 px-3 py-2 text-sm font-medium text-warning-800">{t("user.passwordSectionRequired")}</p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {FIELDS.map(({ name, label, autoComplete }) => {
          const visible = Boolean(shown[name]);
          return (
            <div key={name} className="relative">
              <FormField label={t(label)} icon={Lock} required error={errors[name] ? t(errors[name]!) : undefined}>
                <input
                  type={visible ? "text" : "password"}
                  name={name}
                  autoComplete={autoComplete}
                  value={value[name]}
                  onChange={(e) => onChange({ ...value, [name]: e.target.value })}
                  className={inputStyle.replace("pr-3", "pr-12")}
                />
              </FormField>
              <button
                type="button"
                onClick={() => setShown((current) => ({ ...current, [name]: !visible }))}
                aria-label={t(visible ? "profile.password.hide" : "profile.password.show", { field: t(label) })}
                aria-pressed={visible}
                className="absolute top-[26px] right-0 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-neutral-600 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-brand-800 sm:top-[25px] sm:h-10"
              >
                {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          );
        })}
      </div>
      {!required && (
        <p className="flex items-center gap-1.5 text-xs text-neutral-600">
          <Info className="h-3.5 w-3.5 text-brand-800" aria-hidden="true" />
          {t("profile.password.leaveEmpty")}
        </p>
      )}
    </div>
  );
}

export default PasswordSection;
