import { useId, useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { Scale, ShoppingCart } from "lucide-react";
import api from "../../api/axios.js";
import Modal, { ModalBody, ModalFooter, ModalHeader, modalFormStyle } from "../product/Modal.js";
import FormField, { inputStyle } from "../form/FormField.js";
import RequiredHint from "../form/RequiredHint.js";
import ConfirmModal from "../common/ConfirmModal.js";
import { useFormValidation } from "../../hooks/useFormValidation.js";
import { useCart } from "../../context/CartContext.js";
import { isBlank, REQUIRED } from "../../utils/validation.js";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import type { Product } from "../../types/index.js";

interface AddToCartModalProps {
  product: Product;
  // Shown under the name; defaults to the product's store and city.
  storeLine?: string;
  onClose: () => void;
}

// "Dodaj u korpu" on the marketplace, the store page and the product page: the quantity of one
// product for the restaurant's cart (a product already in the cart starts with its quantity, and
// saving sets it). The cart holds one store: a product of another store asks first whether to
// empty the cart. Nothing is held until the order is sent from the cart.
function AddToCartModal({ product, storeLine, onClose }: AddToCartModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const { cart, setCart } = useCart();
  const inCart = cart?.items.find((line) => line.product_id === product.id);
  // What the restaurant typed; until then the line's quantity (the cart may still be loading
  // when the dialog opens, so it can fill in a moment later).
  const [typedQuantity, setTypedQuantity] = useState<string | null>(null);
  const quantity = typedQuantity ?? (inCart ? String(parseFloat(inCart.quantity)) : "");
  const [submitting, setSubmitting] = useState(false);
  // The store whose products are in the cart, when the server refused another store's product.
  const [otherStore, setOtherStore] = useState<string | null>(null);
  const available = product.available_quantity ?? product.quantity;
  const { formRef, errorFor, blur, validate } = useFormValidation({
    quantity: isBlank(quantity)
      ? REQUIRED
      : Number(quantity) > 0 && Number(quantity) <= parseFloat(available)
        ? undefined
        : "cart.quantityRange",
  });
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const unit = units[product.unit] || product.unit;
  const subtitle = storeLine ?? [product.business_name, product.city].filter(Boolean).join(" · ");

  const save = async (replace: boolean) => {
    setSubmitting(true);
    try {
      const response = await api.put(`/cart/items/${product.id}`, { quantity: Number(quantity), ...(replace && { replace: true }) });
      setCart(response.data.cart);
      toast.success(inCart ? t("cart.updated", { name: product.name }) : t("cart.added", { name: product.name }));
      onClose();
    } catch (err) {
      console.error(err);
      const data = axios.isAxiosError(err) ? err.response?.data : null;
      if (data?.code === "CART_OTHER_STORE") {
        setOtherStore(data.store_name ?? "");
      } else {
        toast.error(data?.error || t("cart.updateError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || !validate()) return;
    save(false);
  };

  if (otherStore !== null) {
    return (
      <ConfirmModal
        title={t("cart.otherStore.title")}
        message={t("cart.otherStore.message", { store: otherStore })}
        confirmLabel={t("cart.otherStore.confirm")}
        cancelLabel={t("cart.otherStore.cancel")}
        variant="danger"
        icon={ShoppingCart}
        busy={submitting}
        onConfirm={() => save(true)}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <ModalHeader>
        <h3 id={titleId} className="text-lg font-bold text-gray-900">
          {inCart ? t("cart.changeTitle") : t("cart.addTitle")}
        </h3>
      </ModalHeader>

      <form ref={formRef} noValidate onSubmit={handleSubmit} className={modalFormStyle}>
        <ModalBody>
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-gray-50 p-3">
            <img
              src={CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.Other}
              alt={product.name}
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-900">{product.name}</p>
              {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
              <p className="mt-0.5 text-sm">
                <span className="font-semibold text-green-600">{product.discounted_price} KM</span>
                <span className="text-gray-400"> · </span>
                <span className="text-gray-600">
                  {t("product.available")}: {parseFloat(available)} {unit}
                </span>
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <FormField label={t("dashboard.quantity")} icon={Scale} suffix={unit} required error={errorFor("quantity")}>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="any"
                max={available}
                placeholder={`${t("myReservations.placeholderMax")}: ${parseFloat(available)}`}
                value={quantity}
                onChange={(e) => setTypedQuantity(e.target.value)}
                onBlur={blur("quantity")}
                className={`${inputStyle} pr-14`}
              />
            </FormField>
            <p className="text-xs text-gray-500">{t("cart.notHeld")}</p>
            <RequiredHint />
          </div>
        </ModalBody>

        <ModalFooter className="pt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {t("myReservations.cancelButton")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 cursor-pointer rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inCart ? t("cart.save") : t("cart.add")}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default AddToCartModal;
