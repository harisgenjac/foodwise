import { useTranslation } from "react-i18next";
import { Handshake } from "lucide-react";
import ComingSoon from "../components/ComingSoon.js";

function SponsorPage() {
  const { t } = useTranslation();

  return (
    <ComingSoon
      icon={Handshake}
      title={t("comingSoon.sponsorTitle")}
      description={t("comingSoon.sponsorDescription")}
      highlights={t("comingSoon.sponsorHighlights", { returnObjects: true }) as string[]}
    />
  );
}

export default SponsorPage;
