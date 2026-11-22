import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ArrowRight, ShoppingCart, Trash2 } from "lucide-react";
import api, { apiErrorMessage } from "../../api/axios.js";
import { useCart } from "../../context/CartContext.js";
import ConfirmModal from "../common/ConfirmModal.js";
import { formatKm } from "../dashboard/OfferCard.js";
import type { Cart } from "../../types/index.js";

// What the cart saves against the full prices: the lines that can be ordered (not unavailable),
// each (full price − price seen) × quantity, never below 0.
export const cartSaving = (cart: Cart) =>
  cart.items
    .filter((line) => !line.flags.unavailable)
    .reduce((sum, line) => sum + Math.max(Number(line.original_price) - Number(line.unit_price_seen), 0) * Number(line.quantity), 0);

// The store page's cart bar (design/stores/store-products.html): while the cart is not empty, a dark
// green bar sticks to the bottom of the content area (above the bottom navigation on phones) with
// "Korpa · <store>" (the cart's store, which may be another one), the item count and total, the
// saving, "Isprazni korpu" (asks first, as on the cart page) and "Idi na korpu →". It is the page's
// last element, so at the end of the page it stops above the footer and never covers the last cards.
function StoreCartBar() {
  const { t, i18n } = useTranslation();
  const { cart, setCart } = useCart();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!cart || cart.items.length === 0) return null;
  const saving = cartSaving(cart);

  const emptyCart = async () => {
    setBusy(true);
    try {
      const response = await api.delete("/cart");
      setCart(response.data.cart);
      setConfirmEmpty(false);
    } catch (err) {
      console.error(err);
      toast.error(apiErrorMessage(err) || t("cart.updateError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="store-cart-bar"
      className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center justify-between gap-3 rounded-[28px] bg-brand-900 py-3 pr-3 pl-4 text-white shadow-[0_12px_32px_rgba(5,46,22,0.3)] sm:gap-4 sm:rounded-full sm:py-3.5 sm:pr-3.5 sm:pl-5 md:bottom-6"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-800 text-lime">
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-[5px] text-[11px] font-extrabold text-brand-900"
          >
            {cart.items.length}
          </span>
        </span>
        <div className="min-w-0">
          <p data-testid="store-cart-bar-store" className="mb-0.5 truncate text-[13px] font-bold text-lime">
            {t("storePage.cartBar.store", { store: cart.store?.business_name ?? "" })}
          </p>
          <p className="text-base font-extrabold">
            {t("storePage.cartBar.items", { count: cart.items.length })} · {formatKm(Number(cart.totals.total), i18n.language)}
          </p>
          {saving > 0 && (
            <p className="text-[13px] text-brand-200">{t("storePage.cartBar.saving", { amount: formatKm(saving, i18n.language) })}</p>
          )}
        </div>
      </div>
      <div className="flex flex-1 gap-2 sm:flex-none">
        <button
          type="button"
          onClick={() => setConfirmEmpty(true)}
          disabled={busy}
          aria-label={t("cart.emptyCart")}
          className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-brand-200/40 text-sm font-bold text-white hover:bg-brand-800 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-lime disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:px-5"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline" aria-hidden="true">
            {t("cart.emptyCart")}
          </span>
        </button>
        <Link
          to="/cart"
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-lime px-6 text-[15px] font-extrabold text-brand-900 hover:brightness-95 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-lime sm:flex-none"
        >
          {t("storePage.cartBar.goToCart")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {confirmEmpty && (
        <ConfirmModal
          title={t("cart.emptyConfirm.title")}
          message={t("cart.emptyConfirm.message")}
          confirmLabel={t("cart.emptyCart")}
          variant="danger"
          icon={Trash2}
          busy={busy}
          onConfirm={emptyCart}
          onClose={() => setConfirmEmpty(false)}
        />
      )}
    </div>
  );
}

export default StoreCartBar;
