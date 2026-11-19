import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Lock, MailPlus } from "lucide-react";

// How a new account gets in: an invitation email with a link to set their own password (the
// default), or a temporary password the creator passes on (for users without email access). Used
// when an admin creates a user or a company, and when a headquarters creates a branch.
export type SignInMethod = "INVITE" | "PASSWORD";

const METHOD_ICONS: Record<SignInMethod, LucideIcon> = { INVITE: MailPlus, PASSWORD: Lock };

interface SignInMethodPickerProps {
  value: SignInMethod;
  onChange: (method: SignInMethod) => void;
}

function SignInMethodPicker({ value, onChange }: SignInMethodPickerProps) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t("admin.createUser.methodSection")} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(["INVITE", "PASSWORD"] as const).map((code) => {
        const Icon = METHOD_ICONS[code];
        const selected = value === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(code)}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
              selected ? "border-brand-800 bg-brand-50" : "border-neutral-200 bg-white hover:border-brand-200"
            }`}
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? "text-brand-800" : "text-neutral-500"}`} strokeWidth={1.8} />
            <span>
              <span className="block font-semibold text-neutral-900">{t(`admin.createUser.methods.${code}.title`)}</span>
              <span className="mt-0.5 block text-xs text-neutral-500">{t(`admin.createUser.methods.${code}.description`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default SignInMethodPicker;
