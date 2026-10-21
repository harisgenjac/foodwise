import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Flame, Snowflake, ThermometerSnowflake } from "lucide-react";
import { useDonationLabels } from "../../hooks/useDonationLabels.js";
import {
  DONATION_STATUS_STYLES,
  DONATION_TYPE_STYLES,
  getDonationImage,
  shortTime,
} from "../../utils/donations.js";
import { daysFromToday, formatDisplayDate, toDateInput } from "../../utils/expiry.js";
import type { DonationOffer } from "../../types/index.js";

const TEMPERATURE_ICONS = { HOT: Flame, COLD: ThermometerSnowflake, FROZEN: Snowflake };

interface DonationCardProps {
  donation: DonationOffer;
  actions?: ReactNode;
}

function DonationCard({ donation, actions }: DonationCardProps) {
  const { t } = useTranslation();
  const labels = useDonationLabels();
  const unit = labels.units[donation.unit] || donation.unit;
  const pickupFrom = shortTime(donation.pickup_from);
  const pickupUntil = shortTime(donation.pickup_until);
  const pickupWindow =
    pickupFrom || pickupUntil ? [pickupFrom, pickupUntil].filter(Boolean).join(" – ") : null;
  const TemperatureIcon = donation.serving_temperature
    ? TEMPERATURE_ICONS[donation.serving_temperature]
    : null;
  const isUrgent =
    donation.status === "Available" && Boolean(donation.expiry_date) && daysFromToday(donation.expiry_date.slice(0, 10)) <= 1;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-36 overflow-hidden">
        <img
          src={getDonationImage(donation.category)}
          alt={donation.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/25 via-transparent to-transparent" />
        <span
          className={`absolute top-3 left-3 rounded-full px-2 py-1 text-xs font-semibold ${DONATION_TYPE_STYLES[donation.donation_type]}`}
        >
          {labels.typeBadges[donation.donation_type]}
        </span>
        <span className="absolute top-3 right-3 bg-white/90 text-xs font-semibold px-2 py-1 rounded-full">
          {labels.categories[donation.category] || donation.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-xs text-gray-400">
            {donation.source_product_id ? t("donations.card.fromProduct") : formatDisplayDate(toDateInput(new Date(donation.created_at)))}
          </p>
          <h3 className="text-lg font-bold text-gray-800 line-clamp-1">{donation.name || t("donations.form.namePlaceholder")}</h3>
        </div>

        <span className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${DONATION_STATUS_STYLES[donation.status]}`}>
          {labels.statuses[donation.status]}
        </span>

        {donation.description && (
          <p className="text-sm text-gray-500 line-clamp-2">{donation.description}</p>
        )}

        <dl className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("donations.card.donorPays")}</dt>
            <dd className="text-right">
              {donation.donation_type === "SPONSORED" ? (
                <>
                  <span className="mr-1 text-gray-400 line-through">{donation.original_price} KM</span>
                  <span className="font-semibold text-violet-700">{donation.donation_price} KM</span>
                </>
              ) : (
                <span className="font-semibold text-green-600">{t("donations.card.free")}</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("dashboard.quantity")}</dt>
            <dd className="font-medium text-gray-800">
              {donation.quantity ? parseFloat(donation.quantity) : "–"} {unit}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("donations.card.expiry")}</dt>
            <dd className={`font-medium ${isUrgent ? "text-red-600" : "text-gray-800"}`}>
              {donation.expiry_date ? formatDisplayDate(donation.expiry_date.slice(0, 10)) : "–"}
            </dd>
          </div>
          {pickupWindow && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">{t("donations.card.pickup")}</dt>
              <dd className="flex items-center gap-1 font-medium text-gray-800">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                {pickupWindow}
              </dd>
            </div>
          )}
        </dl>

        {(TemperatureIcon || donation.allergens.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {TemperatureIcon && donation.serving_temperature && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                <TemperatureIcon className="h-3 w-3" />
                {labels.temperatures[donation.serving_temperature]}
              </span>
            )}
            {donation.allergens.map((allergen) => (
              <span
                key={allergen}
                className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
              >
                {labels.allergens[allergen] || allergen}
              </span>
            ))}
          </div>
        )}

        {actions && <div className="mt-auto flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export default DonationCard;
