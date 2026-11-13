import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import type { AxiosResponse } from "axios";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, ShoppingBasket, ShoppingCart, Store, Trash2 } from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import ConfirmModal from "../components/common/ConfirmModal.js";
import CartLineRow from "../components/cart/CartLineRow.js";
import CheckoutPanel, { type NotSentLine, type SentOrderResult } from "../components/cart/CheckoutPanel.js";
import SendChangesList from "../components/order/SendChangesList.js";
import { useCart } from "../context/CartContext.js";
import { formatMoney, formatOrderCode } from "../utils/orders.js";
import type { Cart } from "../types/index.js";

const dateTimeFormat: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" };

// What was sent, shown in place of the cart until the restaurant goes back to it.
interface SentView extends SentOrderResult {
  storeName: string;
}

// The restaurant's cart (/cart): lines of one store with their live state, and the checkout. After
// sending it shows the order's code, pickup, total and every change made at sending; lines that
// were not sent stay in the cart with their flag (docs/orders-design.md, sections 4 and 5).
function CartPage() {
  const { t } = useTranslation();
  const { cart, status, setCart, refresh } = useCart();
  const [busy, setBusy] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // Lines the last send refused (partial fulfilment off), by product.
  const [notSent, setNotSent] = useState<Set<number>>(new Set());
  const [sent, setSent] = useState<SentView | null>(null);

  // Every /cart call answers the whole cart.
  const change = async (request: () => Promise<AxiosResponse<{ cart: Cart }>>) => {
    setBusy(true);
    try {
      const response = await request();
      setCart(response.data.cart);
      return true;
    } catch (err) {
      console.error(err);
      const data = axios.isAxiosError(err) ? err.response?.data : null;
      toast.error(data?.error || t("cart.updateError"));
      // The cart may have changed meanwhile (another device, the line already gone).
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setQuantity = (productId: number, quantity: number, acceptPrice = false) => {
    setNotSent((current) => {
      const next = new Set(current);
      next.delete(productId);
      return next;
    });
    return change(() => api.put(`/cart/items/${productId}`, { quantity, ...(acceptPrice && { accept_price: true }) }));
  };

  const handleSent = async (result: SentOrderResult) => {
    setSent({ ...result, storeName: cart?.store?.business_name ?? "" });
    setNotSent(new Set());
    await refresh();
  };

  const handleNotSent = async (lines: NotSentLine[]) => {
    setNotSent(new Set(lines.map((line) => line.product_id)));
    toast.error(t("cart.checkout.notSent"));
    await refresh();
  };

  if (sent) {
    const total = sent.order.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
    const leftInCart = (cart?.items.length ?? 0) > 0;
    return (
      <div className="mx-auto max-w-2xl space-y-6 pb-10">
        <section aria-labelledby="sent-title" className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 id="sent-title" className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            {t("orders.send.sentTitle", { code: formatOrderCode(sent.order.code) })}
          </h1>
          <p className="text-sm text-gray-700">{t("orders.send.sentText", { total: formatMoney(total), store: sent.storeName })}</p>
          <p className="text-sm text-gray-700">
            {t("cart.sent.pickup", { date: new Date(sent.order.pickup_at).toLocaleString(undefined, dateTimeFormat) })}
          </p>
          <SendChangesList changes={sent.changes} />
          {leftInCart && (
            <p className="flex gap-2 text-sm text-gray-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              {t("cart.sent.leftInCart")}
            </p>
          )}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            {leftInCart ? (
              <button
                type="button"
                onClick={() => setSent(null)}
                className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                {t("cart.sent.backToCart")}
              </button>
            ) : (
              <Link
                to="/browse-products"
                className="flex-1 rounded-xl bg-gray-100 py-2.5 text-center font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                {t("cart.sent.toOffers")}
              </Link>
            )}
            <Link
              to={`/orders/${sent.order.id}`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600"
            >
              {t("cart.sent.viewOrder")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const header = <ProductPageHeader title={t("cart.title")} subtitle={t("cart.subtitle")} icon={ShoppingCart} />;

  if (status === "loading") return <LoadingSpinner />;
  if (status === "error" || !cart) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-10">
        {header}
        <LoadErrorState />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-10">
        {header}
        <EmptyState
          icon={ShoppingCart}
          title={t("cart.empty.title")}
          subtitle={t("cart.empty.subtitle")}
          action={{ to: "/browse-products", label: t("cart.empty.action") }}
        />
      </div>
    );
  }

  const unavailableCount = cart.items.filter((line) => line.flags.unavailable).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      {header}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section aria-label={t("cart.linesLabel")} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {cart.store && (
              <Link
                to={`/stores/${cart.store.id}`}
                className="inline-flex items-center gap-2 font-semibold text-gray-900 hover:text-orange-700"
              >
                <Store className="h-4 w-4 text-orange-500" />
                {cart.store.business_name}
              </Link>
            )}
            <div className="flex flex-wrap gap-2">
              {unavailableCount > 0 && (
                <button
                  type="button"
                  onClick={() => change(() => api.delete("/cart/unavailable"))}
                  disabled={busy}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("cart.removeUnavailable")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmEmpty(true)}
                disabled={busy}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {t("cart.emptyCart")}
              </button>
            </div>
          </div>

          <p className="flex gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {t("cart.notHeld")}
          </p>

          {notSent.size > 0 && (
            <p role="alert" className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t("cart.checkout.notSent")}
            </p>
          )}

          <ul className="space-y-3">
            {cart.items.map((line) => (
              <CartLineRow
                key={line.product_id}
                line={line}
                blockedSending={notSent.has(line.product_id)}
                busy={busy}
                onSetQuantity={(quantity, options) => setQuantity(line.product_id, quantity, options?.acceptPrice)}
                onRemove={() => change(() => api.delete(`/cart/items/${line.product_id}`))}
              />
            ))}
          </ul>

          <Link
            to={cart.store ? `/stores/${cart.store.id}` : "/browse-products"}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-700 hover:text-orange-800"
          >
            <ShoppingBasket className="h-4 w-4" />
            {t("cart.addMore")}
          </Link>
        </section>

        <div className="lg:sticky lg:top-24">
          <CheckoutPanel cart={cart} onSent={handleSent} onNotSent={handleNotSent} />
        </div>
      </div>

      {confirmEmpty && (
        <ConfirmModal
          title={t("cart.emptyConfirm.title")}
          message={t("cart.emptyConfirm.message")}
          confirmLabel={t("cart.emptyCart")}
          variant="danger"
          icon={Trash2}
          busy={busy}
          onConfirm={async () => {
            await change(() => api.delete("/cart"));
            setConfirmEmpty(false);
          }}
          onClose={() => setConfirmEmpty(false)}
        />
      )}
    </div>
  );
}

export default CartPage;
