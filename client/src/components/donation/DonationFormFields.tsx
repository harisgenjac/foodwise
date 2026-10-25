import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CalendarDays,
  Clock,
  FileText,
  Gift,
  HandCoins,
  HeartHandshake,
  Package,
  Scale,
  Tag,
  Thermometer,
  UtensilsCrossed,
} from "lucide-react";
import FormSection from "../form/FormSection.js";
import FormField, { inputStyle } from "../form/FormField.js";
import PickerField from "../form/PickerField.js";
import { useDonationLabels } from "../../hooks/useDonationLabels.js";
import {
  ALLERGENS,
  MEAL_CATEGORY,
  SERVING_TEMPERATURES,
  donationDiscountPercent,
  getDonationIcon,
} from "../../utils/donations.js";
import { dateInDays } from "../../utils/expiry.js";
import type { DonationField } from "../../utils/donations.js";
import type { DonationFormValues, DonationType } from "../../types/index.js";

const EXPIRY_SHORTCUTS = [0, 1, 3, 7];
const TYPE_ICONS = { FREE: Gift, SPONSORED: HandCoins };

interface DonationFormFieldsProps {
  values: DonationFormValues;
  onChange: <K extends keyof DonationFormValues>(field: K, value: DonationFormValues[K]) => void;
  minExpiryDate?: string | undefined;
  // From useFormValidation: the translated error of a field, and its blur handler.
  errorFor?: (field: DonationField) => string | undefined;
  onBlur?: (field: DonationField) => () => void;
}

// The form sections shared by AddDonationPage and EditDonationPage.
function DonationFormFields({
  values,
  onChange,
  minExpiryDate,
  errorFor = () => undefined,
  onBlur = () => () => {},
}: DonationFormFieldsProps) {
  const { t } = useTranslation();
  const labels = useDonationLabels();
  const isMeal = values.category === MEAL_CATEGORY;
  const isSponsored = values.donation_type === "SPONSORED";
  const discountPercent = donationDiscountPercent(values.original_price, values.donation_price);
  const hasPrices = Number(values.original_price) > 0 && Number(values.donation_price) > 0;
  const donationPriceError = errorFor("donation_price");

  const toggleAllergen = (allergen: string) => {
    onChange(
      "allergens",
      values.allergens.includes(allergen)
        ? values.allergens.filter((item) => item !== allergen)
        : [...values.allergens, allergen],
    );
  };

  const chipStyle = (selected: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
      selected
        ? "border-orange-400 bg-orange-50 text-orange-700"
        : "border-gray-200 text-gray-600 hover:border-orange-200 hover:bg-orange-50/50"
    }`;

  return (
    <>
      <FormSection title={t("donations.form.typeSection")} icon={HeartHandshake} required>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup">
          {(["FREE", "SPONSORED"] as DonationType[]).map((type) => {
            const Icon = TYPE_ICONS[type];
            const selected = values.donation_type === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange("donation_type", type)}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                  selected
                    ? "border-orange-400 bg-orange-50 ring-4 ring-orange-100"
                    : "border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/50"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    type === "FREE" ? "bg-green-50 text-green-600" : "bg-violet-50 text-violet-600"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{t(`donations.types.${type}`)}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{t(`donations.typeDescriptions.${type}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </FormSection>

      <FormSection title={t("donations.form.basicsSection")} icon={FileText}>
        <div className="space-y-4">
          <FormField label={t("donations.form.name")} icon={Package} required error={errorFor("name")}>
            <input
              type="text"
              placeholder={t("donations.form.namePlaceholder")}
              value={values.name}
              onChange={(e) => onChange("name", e.target.value)}
              onBlur={onBlur("name")}
              className={inputStyle}
            />
          </FormField>
          <FormField label={t("donations.form.description")} icon={FileText}>
            <textarea
              rows={3}
              placeholder={t("donations.form.descriptionPlaceholder")}
              value={values.description}
              onChange={(e) => onChange("description", e.target.value)}
              className={`${inputStyle} resize-none`}
            />
          </FormField>

          <PickerField
            label={t("donations.form.category")}
            required
            error={errorFor("category")}
            onBlur={onBlur("category")}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(labels.categories).map(([key, label]) => {
                const Icon = getDonationIcon(key);
                const selected = values.category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onChange("category", key)}
                    aria-pressed={selected}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer ${
                      selected
                        ? "border-orange-400 bg-orange-50 text-orange-700 ring-4 ring-orange-100"
                        : "border-gray-200 bg-white text-gray-700 hover:border-orange-200 hover:bg-orange-50/50"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-orange-600" : "text-gray-400"}`} strokeWidth={1.8} />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </PickerField>
        </div>
      </FormSection>

      {isMeal && (
        <FormSection
          title={t("donations.form.mealSection")}
          description={t("donations.form.mealHint")}
          icon={UtensilsCrossed}
        >
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">{t("donations.form.allergens")}</span>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((allergen) => {
                  const selected = values.allergens.includes(allergen);
                  return (
                    <button
                      key={allergen}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleAllergen(allergen)}
                      className={chipStyle(selected)}
                    >
                      {labels.allergens[allergen]}
                    </button>
                  );
                })}
              </div>
            </div>
            <FormField label={t("donations.form.temperature")} icon={Thermometer}>
              <select
                value={values.serving_temperature}
                onChange={(e) => onChange("serving_temperature", e.target.value)}
                className={inputStyle}
              >
                <option value="">{t("donations.form.noTemperature")}</option>
                {SERVING_TEMPERATURES.map((temperature) => (
                  <option key={temperature} value={temperature}>
                    {labels.temperatures[temperature]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </FormSection>
      )}

      <FormSection
        title={t("donations.form.priceSection")}
        description={t("donations.form.priceHint")}
        icon={Tag}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("donations.form.originalPrice")} icon={Tag} suffix="KM" required error={errorFor("original_price")}>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={values.original_price}
              onChange={(e) => onChange("original_price", e.target.value)}
              onBlur={onBlur("original_price")}
              className={`${inputStyle} pr-12`}
            />
          </FormField>
          {isSponsored && (
            <FormField label={t("donations.form.donationPrice")} icon={HandCoins} suffix="KM" required error={donationPriceError}>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={values.donation_price}
                onChange={(e) => onChange("donation_price", e.target.value)}
                onBlur={onBlur("donation_price")}
                className={`${inputStyle} pr-12`}
              />
            </FormField>
          )}
        </div>
        {isSponsored && hasPrices && !donationPriceError && (
          discountPercent !== null ? (
            <p className="mt-4 inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">
              {t("donations.form.donorPays", { price: values.donation_price, percent: discountPercent })}
            </p>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-sm text-amber-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {t("donations.form.priceInvalid")}
            </p>
          )
        )}
      </FormSection>

      <FormSection title={t("donations.form.stockSection")} icon={Scale}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("donations.form.quantity")} icon={Package} required error={errorFor("quantity")}>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={values.quantity}
              onChange={(e) => onChange("quantity", e.target.value)}
              onBlur={onBlur("quantity")}
              className={inputStyle}
            />
          </FormField>
          <FormField label={t("donations.form.unit")} icon={Scale} required error={errorFor("unit")}>
            <select
              value={values.unit}
              onChange={(e) => onChange("unit", e.target.value)}
              onBlur={onBlur("unit")}
              className={inputStyle}
            >
              <option value="">{t("product.selectUnit")}</option>
              {Object.entries(labels.units).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField label={t("donations.form.expiryDate")} icon={CalendarDays} required error={errorFor("expiry_date")}>
              <input
                type="date"
                min={minExpiryDate}
                value={values.expiry_date}
                onChange={(e) => onChange("expiry_date", e.target.value)}
                onBlur={onBlur("expiry_date")}
                className={inputStyle}
              />
            </FormField>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXPIRY_SHORTCUTS.map((days) => {
                const value = dateInDays(days);
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => onChange("expiry_date", value)}
                    className={chipStyle(values.expiry_date === value)}
                  >
                    {days === 0
                      ? t("product.expiresToday")
                      : days === 1
                        ? t("product.expiresTomorrow")
                        : t("product.expiresInDays", { count: days })}
                  </button>
                );
              })}
            </div>
          </div>
          <FormField label={t("donations.form.pickupFrom")} icon={Clock}>
            <input
              type="time"
              value={values.pickup_from}
              onChange={(e) => onChange("pickup_from", e.target.value)}
              className={inputStyle}
            />
          </FormField>
          <FormField label={t("donations.form.pickupUntil")} icon={Clock} error={errorFor("pickup_until")}>
            <input
              type="time"
              value={values.pickup_until}
              onChange={(e) => onChange("pickup_until", e.target.value)}
              onBlur={onBlur("pickup_until")}
              className={inputStyle}
            />
          </FormField>
          <p className="-mt-2 text-xs text-gray-500 sm:col-span-2">{t("donations.form.pickupHint")}</p>
        </div>
      </FormSection>
    </>
  );
}

export default DonationFormFields;
