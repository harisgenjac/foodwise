import { useEffect, useId, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Mail } from "lucide-react";
import api from "../../api/axios.js";
import FormSection from "../form/FormSection.js";

// The id the emails' footer link points to (/my-profile#email-notifications).
export const EMAIL_NOTIFICATIONS_SECTION = "email-notifications";

// One switch for every role: notification emails on or off. It saves at once, like the auto-renew
// switch. System emails (password reset, login details) are sent either way.
function EmailNotificationsSection({ initial }: { initial: boolean }) {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const labelId = useId();
  const descriptionId = useId();
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  // The footer link of every notification email opens this section.
  useEffect(() => {
    if (hash === `#${EMAIL_NOTIFICATIONS_SECTION}`) {
      document.getElementById(EMAIL_NOTIFICATIONS_SECTION)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  }, [hash]);

  const toggle = async () => {
    if (saving) return;
    const next = !enabled;
    setSaving(true);
    setEnabled(next);
    try {
      await api.patch("/users/me/email-notifications", { enabled: next });
      toast.success(t(next ? "user.emailNotifications.turnedOn" : "user.emailNotifications.turnedOff"));
    } catch (err) {
      setEnabled(!next);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("user.emailNotifications.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id={EMAIL_NOTIFICATIONS_SECTION} className="scroll-mt-20">
      <FormSection title={t("user.emailNotifications.title")} icon={Mail}>
        {/* The whole row is the touch target (at least 44 px high). */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          onClick={toggle}
          disabled={saving}
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 rounded-xl text-left disabled:cursor-wait"
        >
          <span className="min-w-0">
            <span id={labelId} className="block font-medium text-gray-900">
              {t("user.emailNotifications.label")}
            </span>
            <span id={descriptionId} className="mt-0.5 block text-sm text-gray-500">
              {t(enabled ? "user.emailNotifications.onHint" : "user.emailNotifications.offHint")}
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
              enabled ? "bg-orange-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </span>
        </button>
      </FormSection>
    </div>
  );
}

export default EmailNotificationsSection;
