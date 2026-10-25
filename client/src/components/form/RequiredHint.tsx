import { useTranslation } from "react-i18next";

// The one note per form that explains the red asterisk.
function RequiredHint({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return <p className={`text-xs text-gray-500 ${className}`}>{t("user.requiredHint")}</p>;
}

export default RequiredHint;
