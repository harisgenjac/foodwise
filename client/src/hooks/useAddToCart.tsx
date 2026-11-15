import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ShoppingCart } from "lucide-react";
import api from "../api/axios.js";
import { useCart } from "../context/CartContext.js";
import ConfirmModal from "../components/common/ConfirmModal.js";
import type { Product } from "../types/index.js";

type CartProduct = Pick<Product, "id" | "name">;

// The + button and the quantity stepper on product cards (store page, Search): every change goes
// straight to the server cart (PUT /cart/items/:id, DELETE at 0), which answers the whole cart.
// A product of another store than the cart's asks "Empty the cart?" first, as "Add to cart" does;
// render `confirmDialog` once on the page.
export function useAddToCart() {
  const { t } = useTranslation();
  const { cart, setCart, refresh } = useCart();
  const [busyId, setBusyId] = useState<number | null>(null);
  // A change waiting for "Empty the cart?" (the other store's name).
  const [pending, setPending] = useState<{ product: CartProduct; quantity: number; store: string } | null>(null);

  const quantityOf = (productId: number) => {
    const line = cart?.items.find((item) => item.product_id === productId);
    return line ? parseFloat(line.quantity) : 0;
  };

  const save = async (product: CartProduct, quantity: number, replace = false) => {
    setBusyId(product.id);
    try {
      const response =
        quantity <= 0
          ? await api.delete(`/cart/items/${product.id}`)
          : await api.put(`/cart/items/${product.id}`, { quantity, ...(replace && { replace: true }) });
      setCart(response.data.cart);
      setPending(null);
    } catch (err) {
      console.error(err);
      const data = axios.isAxiosError(err) ? err.response?.data : null;
      if (data?.code === "CART_OTHER_STORE") {
        setPending({ product, quantity, store: data.store_name ?? "" });
      } else {
        toast.error(data?.error || t("cart.updateError"));
        // The cart or the stock may have changed meanwhile.
        await refresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const confirmDialog = pending && (
    <ConfirmModal
      title={t("cart.otherStore.title")}
      message={t("cart.otherStore.message", { store: pending.store })}
      confirmLabel={t("cart.otherStore.confirm")}
      cancelLabel={t("cart.otherStore.cancel")}
      variant="danger"
      icon={ShoppingCart}
      busy={busyId !== null}
      onConfirm={() => save(pending.product, pending.quantity, true)}
      onClose={() => setPending(null)}
    />
  );

  return { quantityOf, setQuantity: save, busyId, confirmDialog };
}
