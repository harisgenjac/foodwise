import { useTranslation } from "react-i18next";
import { AlertCircle, CalendarDays, FileText, Package, Scale, Tag } from "lucide-react";
import FormSection from "../form/FormSection.js";
import FormField, { inputStyle } from "../form/FormField.js";
import { getCategoryIcon } from "../../utils/categoryIcons.js";
import { dateInDays } from "../../utils/expiry.js";
import type { ProductFormValues } from "../../types/index.js";

const EXPIRY_SHORTCUTS = [0, 1, 3, 7];

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  description: "",
  category: "",
  original_price: "",
  discounted_price: "",
  quantity: "",
  unit: "",
  expiry_date: "",
};

interface ProductFormFieldsProps {
  values: ProductFormValues;
  onChange: (field: keyof ProductFormValues, value: string) => void;
  // Lower bound for the expiry date input; omitted when editing an already expired product.
  minExpiryDate?: string | undefined;
}

// The three form sections shared by AddProductPage and EditProductPage.
function ProductFormFields({ values, onChange, minExpiryDate }: ProductFormFieldsProps) {
  const { t } = useTranslation();
  const categories = t("categories", { returnObjects: true }) as Record<string, string>;
  const units = t("units", { returnObjects: true }) as Record<string, string>;

  const original = Number(values.original_price);
  const discounted = Number(values.discounted_price);
  const hasPrices = original > 0 && discounted > 0;
  const discountPercent = hasPrices && discounted < original
    ? Math.round((1 - discounted / original) * 100)
    : null;

  return (
    <>
      <FormSection title={t("product.basicsSection")} icon={FileText}>
        <div className="space-y-4">
          <FormField label={t("product.name")} icon={Package}>
            <input
              type="text"
              placeholder={t("product.namePlaceholder")}
              value={values.name}
              onChange={(e) => onChange("name", e.target.value)}
              className={inputStyle}
            />
          </FormField>
          <FormField label={t("product.description")} icon={FileText}>
            <textarea
              rows={3}
              placeholder={t("product.descriptionPlaceholder")}
              value={values.description}
              onChange={(e) => onChange("description", e.target.value)}
              className={`${inputStyle} resize-none`}
            />
          </FormField>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-gray-700">{t("product.category")}</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(categories).map(([key, label]) => {
                const Icon = getCategoryIcon(key);
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
          </div>
        </div>
      </FormSection>

      <FormSection title={t("product.priceSection")} icon={Tag}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("product.originalPrice")} icon={Tag} suffix="KM">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={values.original_price}
              onChange={(e) => onChange("original_price", e.target.value)}
              className={`${inputStyle} pr-12`}
            />
          </FormField>
          <FormField label={t("product.discountedPrice")} icon={Tag} suffix="KM">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={values.discounted_price}
              onChange={(e) => onChange("discounted_price", e.target.value)}
              className={`${inputStyle} pr-12`}
            />
          </FormField>
        </div>
        {hasPrices && (
          discountPercent !== null ? (
            <p className="mt-4 inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
              {t("product.discountBadge", { percent: discountPercent })}
            </p>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-sm text-amber-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {t("product.discountInvalid")}
            </p>
          )
        )}
      </FormSection>

      <FormSection title={t("product.stockSection")} icon={Scale}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("product.quantity")} icon={Package}>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={values.quantity}
              onChange={(e) => onChange("quantity", e.target.value)}
              className={inputStyle}
            />
          </FormField>
          <FormField label={t("product.unit")} icon={Scale}>
            <select value={values.unit} onChange={(e) => onChange("unit", e.target.value)} className={inputStyle}>
              <option value="">{t("product.selectUnit")}</option>
              {Object.entries(units).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField label={t("product.expiryDate")} icon={CalendarDays}>
              <input
                type="date"
                min={minExpiryDate}
                value={values.expiry_date}
                onChange={(e) => onChange("expiry_date", e.target.value)}
                className={inputStyle}
              />
            </FormField>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXPIRY_SHORTCUTS.map((days) => {
                const value = dateInDays(days);
                const selected = values.expiry_date === value;
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => onChange("expiry_date", value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      selected
                        ? "border-orange-400 bg-orange-50 text-orange-700"
                        : "border-gray-200 text-gray-600 hover:border-orange-200 hover:bg-orange-50/50"
                    }`}
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
        </div>
      </FormSection>
    </>
  );
}

export default ProductFormFields;
