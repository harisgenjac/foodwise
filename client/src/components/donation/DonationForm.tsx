import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import DonationFormFields from "./DonationFormFields.js";
import DonationCard from "./DonationCard.js";
import RequiredHint from "../form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { validateDonationForm } from "../../utils/donations.js";
import type { DonationFormValues, DonationOffer } from "../../types/index.js";

interface DonationFormProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  initialValues: DonationFormValues;
  submitLabel: string;
  minExpiryDate?: string | undefined;
  // Sends the request and shows its own success or error toast.
  onSubmit: (values: DonationFormValues) => Promise<void>;
}

// Header, form sections and the sticky live preview shared by AddDonationPage and EditDonationPage.
function DonationForm({
  title,
  subtitle,
  icon: Icon,
  initialValues,
  submitLabel,
  minExpiryDate,
  onSubmit,
}: DonationFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<DonationFormValues>(initialValues);
  const [saving, setSaving] = useState(false);
  const { formRef, errorFor, blur, validate } = useFormValidation(validateDonationForm(form));

  const updateField = <K extends keyof DonationFormValues>(field: K, value: DonationFormValues[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  };

  const preview: DonationOffer = {
    id: 0,
    donor_id: 0,
    source_product_id: null,
    donation_type: form.donation_type,
    name: form.name,
    description: form.description || null,
    category: form.category,
    quantity: form.quantity,
    unit: form.unit,
    original_price: form.original_price || "0",
    donation_price: form.donation_price || "0",
    expiry_date: form.expiry_date,
    pickup_from: form.pickup_from || null,
    pickup_until: form.pickup_until || null,
    allergens: form.category === "Meals" ? form.allergens : [],
    serving_temperature:
      form.category === "Meals" && form.serving_temperature
        ? (form.serving_temperature as DonationOffer["serving_temperature"])
        : null,
    status: "Available",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-gray-900">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Icon className="h-5 w-5" strokeWidth={1.8} />
          </span>
          {title}
        </h1>
        <p className="mt-2 text-sm text-gray-500">{subtitle}</p>
      </div>

      <form ref={formRef} noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DonationFormFields
            values={form}
            onChange={updateField}
            minExpiryDate={minExpiryDate}
            errorFor={errorFor}
            onBlur={blur}
          />
        </div>

        <aside className="lg:sticky lg:top-0 lg:self-start space-y-4">
          <p className="text-sm font-semibold text-gray-700">{t("donations.form.preview")}</p>
          <DonationCard donation={preview} />

          <p className="flex gap-2 rounded-2xl border border-gray-100 bg-white p-4 text-xs text-gray-500 shadow-sm">
            <Info className="h-4 w-4 shrink-0 text-orange-500" />
            {t("donations.info.text")}
          </p>

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-md disabled:translate-y-0 disabled:opacity-60 cursor-pointer"
          >
            <Icon className="h-5 w-5" strokeWidth={1.8} />
            {submitLabel}
          </button>
          <RequiredHint className="text-center" />
          <Link
            to="/donate-food"
            className="block w-full rounded-xl border border-gray-200 bg-white py-2.5 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t("donations.form.cancel")}
          </Link>
        </aside>
      </form>
    </div>
  );
}

export default DonationForm;
