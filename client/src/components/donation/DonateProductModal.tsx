import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { Gift, HandCoins, Scale } from "lucide-react";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import LoadingSpinner from "../LoadingSpinner.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import { donationDiscountPercent } from "../../utils/donations.js";
import type { DonationType, Product } from "../../types/index.js";

interface DonateProductModalProps {
  product: Product;
  onClose: () => void;
  // Called after the product was moved (the modal has already closed).
  onDonated: () => void;
}

// "Move to donations": the unreserved quantity of a store's product becomes a donation offer.
function DonateProductModal({ product, onClose, onDonated }: DonateProductModalProps) {
  const { t } = useTranslation();
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const unit = units[product.unit] || product.unit;
  // My products lists come without the reserved amount, so the modal reads the product itself.
  const [available, setAvailable] = useState<number | null>(
    product.available_quantity !== undefined ? parseFloat(product.available_quantity) : null,
  );
  const [quantity, setQuantity] = useState(available !== null ? String(available) : "");
  const [donationType, setDonationType] = useState<DonationType>("FREE");
  const [donationPrice, setDonationPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const discountPercent = donationDiscountPercent(product.original_price, donationPrice);

  useEffect(() => {
    if (product.available_quantity !== undefined) return;
    const fetchAvailable = async () => {
      try {
        const response = await api.get(`/products/${product.id}`);
        const amount = parseFloat(response.data.product.available_quantity ?? product.quantity);
        setAvailable(amount);
        setQuantity(String(amount));
      } catch (err) {
        console.error("Error fetching product:", err);
        setAvailable(parseFloat(product.quantity));
        setQuantity(product.quantity);
      }
    };
    fetchAvailable();
  }, [product]);

  const { formRef, errorFor, blur, validate } = useFormValidation({
    quantity: isBlank(quantity) ? REQUIRED : undefined,
    donationPrice: donationType === "SPONSORED" && isBlank(donationPrice) ? REQUIRED : undefined,
  });

  const handleDonate = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      await api.post(`/donations/from-product/${product.id}`, {
        donation_type: donationType,
        quantity,
        donation_price: donationType === "SPONSORED" ? donationPrice : null,
      });
      toast.success(t("donations.fromProduct.success"));
      onClose();
      onDonated();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("donations.fromProduct.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-900">{t("donations.fromProduct.title")}</h3>
      <p className="mb-4 mt-1 text-sm text-gray-500">{t("donations.fromProduct.text")}</p>

      <div className="mb-5 flex items-center gap-3 rounded-xl bg-gray-50 p-3">
        <img
          src={CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.Other}
          alt={product.name}
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">{product.name}</p>
          <p className="mt-0.5 text-sm text-gray-600">
            {t("product.available")}: {available ?? "–"} {unit}
            <span className="text-gray-400"> · </span>
            {t("donations.fromProduct.value", { price: product.original_price })}
          </p>
        </div>
      </div>

      <form ref={formRef} noValidate onSubmit={handleDonate}>
        {available === null ? (
          <LoadingSpinner />
        ) : available <= 0 ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t("donations.fromProduct.nothingAvailable")}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(["FREE", "SPONSORED"] as DonationType[]).map((type) => {
                const Icon = type === "FREE" ? Gift : HandCoins;
                const selected = donationType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setDonationType(type)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer ${
                      selected
                        ? "border-orange-400 bg-orange-50 text-orange-700 ring-4 ring-orange-100"
                        : "border-gray-200 bg-white text-gray-700 hover:border-orange-200"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                    {t(`donations.types.${type}`)}
                  </button>
                );
              })}
            </div>
            <FormField
              label={t("donations.fromProduct.quantity")}
              icon={Scale}
              suffix={unit}
              required
              error={errorFor("quantity")}
            >
              <input
                type="number"
                min="0.01"
                step="any"
                max={available}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onBlur={blur("quantity")}
                className={`${inputStyle} pr-14`}
              />
            </FormField>
            {donationType === "SPONSORED" && (
              <>
                <FormField
                  label={t("donations.form.donationPrice")}
                  icon={HandCoins}
                  suffix="KM"
                  required
                  error={errorFor("donationPrice")}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={donationPrice}
                    onChange={(e) => setDonationPrice(e.target.value)}
                    onBlur={blur("donationPrice")}
                    className={`${inputStyle} pr-12`}
                  />
                </FormField>
                {donationPrice && (
                  <p className="text-sm font-medium text-violet-700">
                    {discountPercent !== null
                      ? t("donations.form.donorPays", { price: donationPrice, percent: discountPercent })
                      : t("donations.form.priceInvalid")}
                  </p>
                )}
              </>
            )}
            <RequiredHint />
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {t("donations.form.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting || available === null || available <= 0}
            className="flex-1 cursor-pointer rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("donations.fromProduct.confirm")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default DonateProductModal;
