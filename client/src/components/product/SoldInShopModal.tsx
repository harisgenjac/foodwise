import { useId, useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { Scale, Store, TriangleAlert } from "lucide-react";
import api from "../../api/axios.js";
import Modal, { ModalBody, ModalFooter, ModalHeader, modalFormStyle } from "./Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import type { Product } from "../../types/index.js";

interface SoldInShopModalProps {
  // A product of the store with its free quantity (`available_quantity`).
  product: Pick<Product, "id" | "name" | "unit" | "quantity" | "available_quantity">;
  onClose: () => void;
  // Called after the sale was recorded (the modal has already closed).
  onRecorded: () => void;
}

// Rounds away float noise (10 − 2.3) and drops trailing zeros: 7.7, 50, 0.25.
const formatAmount = (value: number) => String(Math.round(value * 1000) / 1000);

// "Prodano u radnji": the store records an amount it sold at its own till, which lowers the
// product's free quantity. It cannot be undone, so the second step repeats the amount and the free
// quantity before and after; a mistake means publishing a new product.
function SoldInShopModal({ product, onClose, onRecorded }: SoldInShopModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const unit = units[product.unit] || product.unit;
  const available = parseFloat(product.available_quantity ?? product.quantity);
  const [quantity, setQuantity] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const amount = parseFloat(quantity);
  const { formRef, errorFor, blur, validate } = useFormValidation({
    quantity: isBlank(quantity)
      ? REQUIRED
      : !(amount > 0)
        ? "soldInShop.positive"
        : amount > available
          ? "soldInShop.tooMuch"
          : undefined,
  });

  const goToConfirm = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validate()) setConfirming(true);
  };

  const record = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/products/${product.id}/shop-sales`, { quantity });
      toast.success(t("soldInShop.success"));
      onClose();
      onRecorded();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("soldInShop.error"));
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelButton = (
    <button
      type="button"
      onClick={onClose}
      className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
    >
      {t("soldInShop.cancel")}
    </button>
  );

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <ModalHeader>
        <h3 id={titleId} className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Store className="h-5 w-5 text-orange-600" />
          {t("soldInShop.title")}
        </h3>
        <p className="mt-1 text-sm text-gray-500">{t("soldInShop.text")}</p>
      </ModalHeader>

      {confirming ? (
        <>
          <ModalBody>
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">{product.name}</p>
              <p>{t("soldInShop.confirmAmount", { amount: formatAmount(amount), unit })}</p>
              <p>
                {t("soldInShop.confirmAfter", {
                  after: formatAmount(available - amount),
                  before: formatAmount(available),
                  unit,
                })}
              </p>
              <p className="flex items-start gap-2 font-semibold">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {t("soldInShop.cannotUndo")}
              </p>
            </div>
          </ModalBody>
          <ModalFooter className="pt-6">
            {cancelButton}
            <button
              type="button"
              onClick={record}
              disabled={submitting}
              className="flex-1 cursor-pointer rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
            >
              {t("soldInShop.confirmButton")}
            </button>
          </ModalFooter>
        </>
      ) : (
        <form ref={formRef} noValidate onSubmit={goToConfirm} className={modalFormStyle}>
          <ModalBody>
            <p className="mb-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
              <span className="font-semibold text-gray-900">{product.name}</span>
              <span className="text-gray-400"> · </span>
              {t("soldInShop.free", { amount: formatAmount(available), unit })}
            </p>
            {available <= 0 ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("soldInShop.nothingFree")}</p>
            ) : (
              <div className="space-y-4">
                <FormField label={t("soldInShop.quantity")} icon={Scale} suffix={unit} required error={errorFor("quantity")}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="any"
                    max={available}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    onBlur={blur("quantity")}
                    className={`${inputStyle} pr-14`}
                  />
                </FormField>
                <p className="text-xs text-gray-500">{t("soldInShop.hint")}</p>
                <RequiredHint />
              </div>
            )}
          </ModalBody>
          <ModalFooter className="pt-6">
            {cancelButton}
            {available > 0 && (
              <button
                type="submit"
                className="flex-1 cursor-pointer rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600"
              >
                {t("soldInShop.next")}
              </button>
            )}
          </ModalFooter>
        </form>
      )}
    </Modal>
  );
}

export default SoldInShopModal;
