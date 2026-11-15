import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { useCart } from "../../context/CartContext.js";
import CheckoutPanel from "../cart/CheckoutPanel.js";
import QuantityStepper from "../common/QuantityStepper.js";
import { formatMoney } from "../../utils/orders.js";

interface CartActions {
  busyId: number | null;
  setQuantity: (product: { id: number; name: string }, quantity: number) => void;
}

// Phones and tablets (below lg): a bar above the bottom navigation, "Korpa · 3 proizvoda ·
// 45,00 KM", that opens the cart page (its checkout has "Accept partial fulfilment"). Hidden
// while the cart is empty.
export function StoreCartBar() {
  const { t } = useTranslation();
  const { cart } = useCart();
  if (!cart || cart.items.length === 0) return null;
  return (
    <Link
      to="/cart"
      data-testid="store-cart-bar"
      className="fixed inset-x-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-20 flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-orange-500 px-4 py-3 font-semibold text-white shadow-lg shadow-orange-500/30 md:bottom-4 lg:hidden"
    >
      <span className="flex min-w-0 items-center gap-2">
        <ShoppingCart className="h-5 w-5 shrink-0" />
        <span className="truncate">
          {t("store.page.cartBar", { count: cart.items.length, total: formatMoney(cart.totals.total) })}
        </span>
      </span>
      <ArrowRight className="h-5 w-5 shrink-0" />
    </Link>
  );
}

// Desktop (lg and up): the cart as a panel on the right of the store page, with steppers and the
// cart page's checkout. After sending, the cart page shows what was sent (and what changed).
export function StoreCartPanel({ storeId, actions }: { storeId: number; actions: CartActions }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cart } = useCart();
  const units = t("units", { returnObjects: true }) as Record<string, string>;

  if (!cart || cart.items.length === 0) {
    return (
      <section aria-labelledby="store-cart-title" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 id="store-cart-title" className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <ShoppingCart className="h-5 w-5 text-orange-600" />
          {t("store.page.cartTitle")}
        </h2>
        <p className="mt-2 text-sm text-gray-500">{t("store.page.cartEmpty")}</p>
      </section>
    );
  }

  if (cart.store && cart.store.id !== storeId) {
    return (
      <section aria-labelledby="store-cart-title" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 id="store-cart-title" className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <ShoppingCart className="h-5 w-5 text-orange-600" />
          {t("store.page.cartTitle")}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {t("store.page.cartOtherStore", { store: cart.store.business_name ?? "", count: cart.items.length })}
        </p>
        <Link to="/cart" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-700 hover:text-orange-800">
          {t("store.page.openCart")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="store-cart-title" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 id="store-cart-title" className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <ShoppingCart className="h-5 w-5 text-orange-600" />
            {t("store.page.cartTitle")}
          </h2>
          <Link to="/cart" className="text-sm font-medium text-orange-700 hover:text-orange-800">
            {t("store.page.openCart")}
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-gray-100">
          {cart.items.map((line) => (
            <li key={line.product_id} data-testid="store-cart-line" className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-2 text-sm">
                <span className={`font-medium ${line.flags.unavailable ? "text-gray-400 line-through" : "text-gray-900"}`}>
                  {line.name}
                </span>
                <span className="shrink-0 font-semibold text-gray-900 tabular-nums">
                  {formatMoney(Number(line.quantity) * Number(line.unit_price_seen))}
                </span>
              </div>
              {line.flags.unavailable ? (
                <p className="text-xs text-red-600">{t("store.page.lineUnavailable")}</p>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <QuantityStepper
                    name={line.name}
                    unit={line.unit}
                    value={parseFloat(line.quantity)}
                    max={parseFloat(line.available_quantity)}
                    busy={actions.busyId === line.product_id}
                    onChange={(quantity) => actions.setQuantity({ id: line.product_id, name: line.name }, quantity)}
                  />
                  <span className="text-xs text-gray-500">
                    {formatMoney(line.unit_price_seen)} / {units[line.unit] ?? line.unit}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <CheckoutPanel
        cart={cart}
        onSent={(result) =>
          navigate("/cart", { state: { sent: { ...result, storeName: cart.store?.business_name ?? "" } } })
        }
        onNotSent={(lines) => navigate("/cart", { state: { notSent: lines.map((line) => line.product_id) } })}
      />
    </div>
  );
}
