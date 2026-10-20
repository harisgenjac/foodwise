import { useTranslation } from "react-i18next";

// Translated labels for donation offers: the product categories and units plus the
// donation-only meal category and portion unit.
export function useDonationLabels() {
  const { t } = useTranslation();
  const asRecord = (key: string) => t(key, { returnObjects: true }) as Record<string, string>;

  return {
    categories: { ...asRecord("categories"), ...asRecord("donations.categories") },
    units: { ...asRecord("units"), ...asRecord("donations.units") },
    allergens: asRecord("donations.allergens"),
    temperatures: asRecord("donations.temperatures"),
    statuses: asRecord("donations.statuses"),
    typeBadges: asRecord("donations.typeBadges"),
  };
}
