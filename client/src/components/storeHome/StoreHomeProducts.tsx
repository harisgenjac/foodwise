import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import OfferCard from "../dashboard/OfferCard.js";
import PriceEditor from "./PriceEditor.js";
import { formatNumber } from "../../utils/numbers.js";
import type { StoreHomeProduct } from "../../types/index.js";

interface StoreHomeProductsProps {
  // The store's four products that expire soonest (the server picks them).
  products: StoreHomeProduct[];
}

// "Ističe uskoro u vašoj ponudi" on the store home page: the restaurant home's offer card with what
// open orders hold ("Rezervisano") and a price editor instead of the cart button. The parent hides
// the section without products.
function StoreHomeProducts({ products }: StoreHomeProductsProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  // Saved prices, shown at once (the next load of the page brings them too).
  const [saved, setSaved] = useState<Record<number, StoreHomeProduct>>({});

  return (
    <section aria-labelledby={titleId} data-testid="store-home-products" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-[28px] font-extrabold tracking-[-0.5px]">
            {t("storeHome.products.title")}
          </h2>
          <p className="mt-0.5 text-[15px] text-neutral-600">{t("storeHome.products.subtitle")}</p>
        </div>
        <Link
          to="/my-products"
          className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-bold text-brand-800 hover:text-brand-900"
        >
          {t("storeHome.products.all")}
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
        {products.map((original) => {
          const product = saved[original.id] ?? original;
          const reserved = parseFloat(product.reserved_quantity);
          return (
            <OfferCard
              key={product.id}
              testId="store-home-product"
              product={product}
              details={
                <p className="text-sm text-neutral-600">
                  {reserved > 0
                    ? t("storeHome.products.reserved", {
                        amount: `${formatNumber(reserved, i18n.language, 2, 0)} ${product.unit}`,
                      })
                    : t("storeHome.products.noReservations")}
                </p>
              }
              footer={
                <PriceEditor
                  product={product}
                  onSaved={(next) => setSaved((current) => ({ ...current, [next.id]: next }))}
                />
              }
            />
          );
        })}
      </div>
    </section>
  );
}

export default StoreHomeProducts;
