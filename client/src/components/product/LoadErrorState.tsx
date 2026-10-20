import { useTranslation } from "react-i18next";
import { CloudOff } from "lucide-react";
import EmptyState from "./EmptyState.js";

// Shown instead of an empty list when the list could not be loaded at all.
function LoadErrorState() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={CloudOff}
      title={t("common.loadErrorTitle")}
      subtitle={t("common.loadErrorSubtitle")}
    />
  );
}

export default LoadErrorState;
