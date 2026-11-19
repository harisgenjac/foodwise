import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "../api/axios.js";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Bookmark, FileUp, PackagePlus } from "lucide-react";
import ProductFormFields, { EMPTY_PRODUCT_FORM, validateProductForm } from "../components/product/ProductFormFields.js";
import RequiredHint from "../components/form/RequiredHint.js";
import { useFormValidation } from "../hooks/useFormValidation.js";
import ProductPreview from "../components/product/ProductPreview.js";
import ProductTemplatesPanel from "../components/product/ProductTemplatesPanel.js";
import { dateInDays, daysFromToday, toDateInput } from "../utils/expiry.js";
import type { ProductFormValues, ProductTemplate } from "../types/index.js";
import InsufficientCreditsNotice from "../components/credits/InsufficientCreditsNotice.js";
import CreditHint from "../components/credits/CreditHint.js";
import { getCreditError, type CreditError } from "../utils/credits.js";

function AddProductPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM);
  const [creditError, setCreditError] = useState<CreditError | null>(null);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [appliedTemplateId, setAppliedTemplateId] = useState<number | null>(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const { t } = useTranslation();
  const { formRef, errorFor, blur, validate, reset } = useFormValidation(validateProductForm(form));

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await api.get("/product-templates");
        setTemplates(response.data.templates);
      } catch (err) {
        console.error("Error fetching templates:", err);
      }
    };
    fetchTemplates();
  }, []);

  const updateField = (field: keyof ProductFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const clearForm = () => {
    setForm(EMPTY_PRODUCT_FORM);
    setAppliedTemplateId(null);
    reset();
  };

  // Clicking the template that is already applied deselects it and empties the form.
  const applyTemplate = (template: ProductTemplate) => {
    if (appliedTemplateId === template.id) {
      clearForm();
      return;
    }
    setForm({
      name: template.name,
      description: template.description ?? "",
      category: template.category,
      unit: template.unit,
      original_price: template.original_price ?? "",
      discounted_price: template.discounted_price ?? "",
      quantity: template.quantity ?? "",
      expiry_date: template.shelf_life_days !== null ? dateInDays(template.shelf_life_days) : "",
      image_url: template.image_url ?? "",
    });
    setAppliedTemplateId(template.id);
    reset();
    toast.success(t("templates.applied", { name: template.name }));
  };

  const deleteTemplate = async (template: ProductTemplate) => {
    try {
      await api.delete(`/product-templates/${template.id}`);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      if (appliedTemplateId === template.id) setAppliedTemplateId(null);
      toast.success(t("templates.deleted"));
    } catch (err) {
      const message = apiErrorMessage(err);
      toast.error(message || t("templates.deleteError"));
    }
  };

  // Runs after the product is created; a failure here must not undo or hide that success.
  const saveTemplate = async () => {
    try {
      const response = await api.post("/product-templates", {
        name: form.name,
        description: form.description,
        category: form.category,
        unit: form.unit,
        original_price: form.original_price,
        discounted_price: form.discounted_price,
        quantity: form.quantity,
        shelf_life_days: Math.max(0, daysFromToday(form.expiry_date)),
        image_url: form.image_url || null,
      });
      const saved: ProductTemplate = response.data.template;
      setTemplates((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      toast.success(t("templates.saved"));
    } catch (err) {
      console.error("Error saving template:", err);
      toast.error(t("templates.saveError"));
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setCreditError(null);
    try {
      await api.post("/products", { ...form, image_url: form.image_url || null });
      toast.success(t("product.addedSuccess"));
      if (saveAsTemplate) {
        await saveTemplate();
      }
      navigate("/dashboard");
    } catch (err) {
      const credits = getCreditError(err);
      if (credits) {
        setCreditError(credits);
        return;
      }
      const message = apiErrorMessage(err);
      toast.error(message || t("product.addError"));
    } finally {
      setSaving(false);
    }
  };

  const templateExists = templates.some(
    (template) => template.name.trim().toLowerCase() === form.name.trim().toLowerCase(),
  );

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-neutral-900">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-800">
              <PackagePlus className="h-5 w-5" strokeWidth={1.8} />
            </span>
            {t("product.addTitle")}
          </h1>
          <p className="mt-2 text-sm text-neutral-500">{t("product.addSubtitle")}</p>
        </div>
        <Link
          to="/import-products"
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <FileUp className="h-4 w-4" />
          {t("importProducts.link")}
        </Link>
      </div>

      {creditError && <InsufficientCreditsNotice error={creditError} className="mb-6" />}

      <form ref={formRef} noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ProductTemplatesPanel
            templates={templates}
            appliedId={appliedTemplateId}
            onApply={applyTemplate}
            onDelete={deleteTemplate}
          />

          <ProductFormFields
            values={form}
            onChange={updateField}
            minExpiryDate={toDateInput(new Date())}
            errorFor={errorFor}
            onBlur={blur}
          />
        </div>

        <aside className="lg:sticky lg:top-22 lg:self-start space-y-4">
          <ProductPreview values={form} />

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm transition-colors hover:border-brand-200">
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100 ${
                saveAsTemplate ? "bg-brand-800" : "bg-neutral-200"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  saveAsTemplate ? "translate-x-4.5" : "translate-x-0.5"
                }`}
              />
            </span>
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                <Bookmark className="h-4 w-4 text-brand-800" />
                {templateExists ? t("templates.updateToggle") : t("templates.saveToggle")}
              </span>
              <span className="mt-0.5 block text-xs text-neutral-500">{t("templates.saveHint")}</span>
            </span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-800 py-3 font-semibold text-white shadow-sm shadow-brand-800/20 transition-all hover:-translate-y-0.5 hover:bg-brand-900 hover:shadow-md disabled:translate-y-0 disabled:opacity-60 cursor-pointer"
          >
            <PackagePlus className="h-5 w-5" strokeWidth={1.8} />
            {t("product.addButton")}
          </button>
          <CreditHint className="justify-center" />
          <RequiredHint className="text-center" />
          <Link
            to="/my-products"
            className="block w-full rounded-xl border border-neutral-200 bg-white py-2.5 text-center text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            {t("product.cancel")}
          </Link>
        </aside>
      </form>
    </div>
  );
}

export default AddProductPage;
