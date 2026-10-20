import { useTranslation } from "react-i18next";
import { HandHeart } from "lucide-react";
import ComingSoon from "../components/ComingSoon.js";

function DonateFoodPage() {
  const { t } = useTranslation();

  return (
    <ComingSoon
      icon={HandHeart}
      title={t("comingSoon.donateTitle")}
      description={t("comingSoon.donateDescription")}
      highlights={t("comingSoon.donateHighlights", { returnObjects: true }) as string[]}
    />
  );
}

export default DonateFoodPage;
