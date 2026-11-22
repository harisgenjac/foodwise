import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import ProductImage from "../product/ProductImage.js";
import { getDaysUntilExpiry } from "../../utils/expiry.js";
import { formatNumber } from "../../utils/numbers.js";
import type { Product } from "../../types/index.js";

export const formatKm = (value: number, language: string) => `${formatNumber(value, language, 2)} KM`;

// The discount of a price against the full one, in whole percent (0 without a full price).
export const discountPercent = (original: number, discounted: number) =>
  original > 0 ? Math.round((1 - discounted / original) * 100) : 0;

interface OfferCardProps {
  product: Product;
  // Lines under "Dostupno" (the store home's "Rezervisano").
  details?: ReactNode;
  // Next to the price (the restaurant home's "+"); it must sit above the stretched link (z-10).
  action?: ReactNode;
  // Under the price (the store home's price editor), above the stretched link.
  footer?: ReactNode;
  testId?: string;
  // A green border: the store page marks a product that is in the cart.
  selected?: boolean;
  // Opened from the store page: the product page's breadcrumbs then go through the store.
  fromStore?: boolean;
  // The name's link covers the whole card (the home pages). The store page turns it off, so a tap
  // next to "+" or the stepper does not open the product; only the name is a link there.
  stretchedLink?: boolean;
}

// One offer of the home pages and the store page: the image with the discount, the name (a link to
// the product page, by default stretched over the card), the expiry, what is left, the price per
// unit with the old one struck through, and the page's own action or footer.
function OfferCard({
  product,
  details,
  action,
  footer,
  testId = "home-offer",
  selected = false,
  fromStore = false,
  stretchedLink = true,
}: OfferCardProps) {
  const { t, i18n } = useTranslation();
  const original = Number(product.original_price);
  const discounted = Number(product.discounted_price);
  const discount = discountPercent(original, discounted);
  const days = getDaysUntilExpiry(product);
  const soon = days <= 1;
  const expiry =
    days <= 0 ? t("product.expiresToday") : days === 1 ? t("product.expiresTomorrow") : t("product.expiresInDays", { count: days });
  const available = parseFloat(product.available_quantity ?? product.quantity);

  return (
    <article
      data-testid={testId}
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_2px_8px_rgba(28,25,23,0.05)] ${
        stretchedLink
          ? "transition hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-brand-800"
          : ""
      } ${selected ? "border-brand-300" : "border-neutral-200"}`}
    >
      <div className="relative h-[176px] bg-neutral-100">
        <ProductImage imageUrl={product.image_url} alt="" className="h-full w-full object-cover" />
        {discount > 0 && (
          <span
            data-testid="offer-discount"
            className="absolute top-3 left-3 rounded-full bg-accent-700 px-2.5 py-[3px] text-[13px] font-extrabold text-white"
          >
            −{discount}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-[7px] px-4 pt-3.5 pb-4">
        <h4 className="text-base font-bold">
          {/* Stretched: the whole card opens the product; the action and footer sit above this link. */}
          <Link
            to={`/products/${product.id}`}
            state={fromStore ? { fromStore: true } : undefined}
            className={
              stretchedLink
                ? "outline-none after:absolute after:inset-0 after:content-['']"
                : "rounded-sm hover:text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
            }
          >
            {product.name}
          </Link>
        </h4>
        <p
          data-testid="home-offer-expiry"
          className={`flex items-center gap-1.5 text-sm ${soon ? "font-bold text-danger-700" : "font-medium text-neutral-600"}`}
        >
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {expiry}
        </p>
        <p className="text-sm text-neutral-600">
          {t("store.page.available", { amount: `${formatNumber(available, i18n.language, 2, 0)} ${product.unit}` })}
        </p>
        {details}
        <div className="mt-auto flex items-end gap-2 pt-1.5">
          <div className="flex-1 leading-tight">
            <p>
              <span data-testid="offer-price" className="text-xl font-extrabold text-accent-700">
                {formatKm(discounted, i18n.language)}
              </span>
              <span className="text-sm text-neutral-600"> / {product.unit}</span>
            </p>
            {discount > 0 && <p className="text-sm text-neutral-600 line-through">{formatKm(original, i18n.language)}</p>}
          </div>
          {action}
        </div>
        {footer}
      </div>
    </article>
  );
}

export default OfferCard;
