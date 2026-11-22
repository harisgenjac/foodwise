import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Info } from "lucide-react";
import api, { apiErrorMessage } from "../../api/axios.js";
import { discountPercent, formatKm } from "../dashboard/OfferCard.js";
import type { StoreHomeProduct } from "../../types/index.js";

// A typed price as a number: a comma or a point as the decimal sign; null when it is not a number.
export const parsePrice = (text: string): number | null => {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return Number(normalized);
};

type Check = { valid: true; price: number } | { valid: false; error: string | null };

// The new price must be above 0 and below the full price.
const checkPrice = (text: string, original: number, language: string, t: ReturnType<typeof useTranslation>["t"]): Check => {
  if (text.trim() === "") return { valid: false, error: null };
  const price = parsePrice(text);
  if (price === null || price <= 0) return { valid: false, error: t("storeHome.products.priceAboveZero") };
  if (price >= original) return { valid: false, error: t("storeHome.products.priceBelowFull", { price: formatKm(original, language) }) };
  return { valid: true, price };
};

// "Važi za nove narudžbe": a small dark tooltip on an info button (hover, focus, tap; Escape closes).
function NewOrdersTip() {
  const { t } = useTranslation();
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t("storeHome.products.tipLabel")}
        aria-describedby={tipId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="relative flex h-6 w-6 cursor-help items-center justify-center rounded-full text-neutral-600 after:absolute after:-inset-2.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-brand-800"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id={tipId}
        role="tooltip"
        data-open={open}
        className={`absolute bottom-[calc(100%+8px)] left-1/2 z-20 -translate-x-1/2 rounded-[10px] bg-neutral-900 px-3 py-2 text-[13px] leading-[1.4] font-semibold whitespace-nowrap text-white transition-opacity ${
          open ? "opacity-100" : "invisible opacity-0"
        }`}
      >
        {t("storeHome.products.tip")}
      </span>
    </span>
  );
}

interface PriceEditorProps {
  product: StoreHomeProduct;
  // The saved product (its new price).
  onSaved: (product: StoreHomeProduct) => void;
}

// The store home's "Nova cijena" under an expiring product: a decimal input with "KM", Save, and a
// line with the new discount or what is wrong. Save changes only the discounted price through the
// product edit (PUT /products/:id with the rest of the product as it is); order items keep theirs.
function PriceEditor({ product, onSaved }: PriceEditorProps) {
  const { t, i18n } = useTranslation();
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const original = Number(product.original_price);
  const check = checkPrice(text, original, i18n.language, t);
  const error = serverError ?? (check.valid ? null : check.error);

  const save = async () => {
    if (!check.valid || saving) return;
    setSaving(true);
    try {
      const response = await api.put(`/products/${product.id}`, {
        name: product.name,
        description: product.description,
        category: product.category,
        original_price: product.original_price,
        discounted_price: String(check.price),
        quantity: product.quantity,
        unit: product.unit,
        expiry_date: product.expiry_date.slice(0, 10),
      });
      toast.success(t("storeHome.products.saved"));
      setText("");
      setSaved(true);
      onSaved({ ...product, discounted_price: response.data.product?.discounted_price ?? String(check.price) });
    } catch (err) {
      setServerError(apiErrorMessage(err) || t("storeHome.products.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const hint = error ? (
    <span className="text-danger-700">{error}</span>
  ) : check.valid ? (
    <span className="text-success-800">
      {t("storeHome.products.newDiscount", { percent: discountPercent(original, check.price) })}
    </span>
  ) : saved ? (
    <span className="text-success-800">{t("storeHome.products.changed")}</span>
  ) : null;

  return (
    <div className="relative z-10 mt-2.5 flex flex-col gap-1.5 border-t border-neutral-100 pt-2.5">
      <div className="flex items-center gap-1 text-[13px] font-bold text-neutral-700">
        <label htmlFor={inputId}>{t("storeHome.products.newPrice")}</label>
        <NewOrdersTip />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <span
          className={`flex h-11 min-w-0 flex-1 items-center rounded-xl border-[1.5px] bg-white px-3 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand-800 ${
            error ? "border-danger-600" : "border-neutral-200"
          }`}
        >
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setServerError(null);
              setSaved(false);
            }}
            placeholder={Number(product.discounted_price).toFixed(2).replace(".", i18n.language === "bs" ? "," : ".")}
            aria-label={t("storeHome.products.newPriceFor", { name: product.name })}
            aria-invalid={error ? true : undefined}
            aria-describedby={hintId}
            className="w-full min-w-0 bg-transparent text-base font-bold text-neutral-900 outline-none placeholder:font-medium placeholder:text-neutral-500"
          />
          <span className="text-sm font-semibold text-neutral-600" aria-hidden="true">
            KM
          </span>
        </span>
        <button
          type="submit"
          disabled={saving}
          aria-disabled={!check.valid || undefined}
          className="h-11 cursor-pointer rounded-xl bg-brand-800 px-4 text-sm font-bold text-white transition-colors hover:bg-brand-900 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
        >
          {t("storeHome.products.save")}
        </button>
      </form>
      <p id={hintId} data-testid="price-hint" aria-live="polite" className="min-h-[18px] text-[13px] font-semibold">
        {hint}
      </p>
    </div>
  );
}

export default PriceEditor;
