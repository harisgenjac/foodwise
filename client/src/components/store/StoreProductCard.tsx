import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarClock, Plus } from "lucide-react";
import ProductImage from "../product/ProductImage.js";
import QuantityStepper from "../common/QuantityStepper.js";
import { getDaysUntilExpiry } from "../../utils/expiry.js";
import { formatAmount, formatMoney } from "../../utils/orders.js";
import type { Product } from "../../types/index.js";

interface StoreProductCardProps {
  product: Product;
  // What the cart holds of this product (0 = not in the cart).
  inCart: number;
  busy: boolean;
  onSetQuantity: (quantity: number) => void;
}

// A product on the store page (and Search): image with the discount, name, expiry, what is left
// and the price, and a + button that turns into a quantity stepper once the product is in the cart.
function StoreProductCard({ product, inCart, busy, onSetQuantity }: StoreProductCardProps) {
  const { t } = useTranslation();
  const available = parseFloat(product.available_quantity ?? product.quantity);
  const original = Number(product.original_price);
  const discounted = Number(product.discounted_price);
  const discount = original > 0 ? Math.round((1 - discounted / original) * 100) : 0;
  const days = getDaysUntilExpiry(product);
  const expiry =
    days <= 0 ? t("product.expiresToday") : days === 1 ? t("product.expiresTomorrow") : t("product.expiresInDays", { count: days });

  return (
    <article
      data-testid="store-product-card"
      className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
    >
      <Link to={`/products/${product.id}`} state={{ fromStore: true }} className="relative block aspect-4/3 overflow-hidden">
        <ProductImage imageUrl={product.image_url} alt={product.name} className="h-full w-full object-cover" />
        {discount > 0 && (
          <span className="absolute top-2 left-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold text-white">
            −{discount}%
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <Link
          to={`/products/${product.id}`}
          state={{ fromStore: true }}
          className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-orange-700"
        >
          {product.name}
        </Link>
        <p className={`flex items-center gap-1 text-xs ${days <= 1 ? "font-medium text-red-600" : "text-gray-500"}`}>
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          {expiry}
        </p>
        <p className="text-xs text-gray-500">{t("store.page.available", { amount: formatAmount(available, product.unit) })}</p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-1">
          <p className="leading-tight">
            <span className="block text-base font-bold text-gray-900">
              {formatMoney(product.discounted_price)}
              <span className="text-xs font-normal text-gray-500"> / {product.unit}</span>
            </span>
            {discount > 0 && <span className="text-xs text-gray-400 line-through">{formatMoney(product.original_price)}</span>}
          </p>
          {inCart > 0 ? (
            <QuantityStepper
              name={product.name}
              unit={product.unit}
              value={inCart}
              max={available}
              busy={busy}
              onChange={onSetQuantity}
            />
          ) : (
            <button
              type="button"
              disabled={busy || available <= 0}
              onClick={() => onSetQuantity(Math.min(1, available))}
              aria-label={t("stepper.add", { name: product.name })}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-orange-500 text-white shadow-sm shadow-orange-500/30 transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default StoreProductCard;
