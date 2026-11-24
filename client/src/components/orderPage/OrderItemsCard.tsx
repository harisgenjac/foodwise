import { useId } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ProductImage from "../product/ProductImage.js";
import { formatKm } from "../dashboard/OfferCard.js";
import { changeReasonText, formatAmount, isDropped, isReduced, lineTotal, orderedLineTotal } from "../../utils/orders.js";
import { storeTone } from "../../utils/storeTone.js";
import { CARD_LINK, PAGE_CARD } from "./styles.js";
import type { OrderDetails, OrderItem } from "../../types/index.js";

// The product's image, or its initial on a tint (the same tint for the same product).
function ItemThumb({ item }: { item: OrderItem }) {
  if (item.image_url) {
    return <ProductImage imageUrl={item.image_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />;
  }
  const tone = storeTone(item.product_id);
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: tone.soft, color: tone.strong }}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-extrabold"
    >
      {item.product_name.charAt(0).toUpperCase()}
    </span>
  );
}

// "Proizvodi" (design/order-details/): one line per product with its image, the name (a link to the
// product), quantity × price and the line total; a reduced line shows "6 kom → 4 kom" with a short
// note, a rejected or cancelled line is struck through with its reason in red. "Ukupno" at the
// bottom, with the sent total struck through when it changed.
function OrderItemsCard({ order }: { order: OrderDetails }) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const km = (value: number | string) => formatKm(Number(value), i18n.language);
  const changed = Math.round(Number(order.total) * 100) !== Math.round(Number(order.ordered_total) * 100);

  const note = (item: OrderItem) => {
    const reason = changeReasonText(item, t);
    if (isDropped(item)) {
      const what = t(item.status === "Rejected" ? "orderPage.items.rejected" : "orderPage.items.cancelled");
      return { text: reason ? `${what}: ${reason}` : what, className: "text-danger-700" };
    }
    if (isReduced(item)) {
      const what = t("orderPage.items.reduced", {
        accepted: parseFloat(item.quantity),
        ordered: formatAmount(item.ordered_quantity, item.unit),
      });
      return { text: reason ? `${what} · ${reason}` : what, className: "text-warning-800" };
    }
    return null;
  };

  return (
    <section
      aria-labelledby={titleId}
      data-testid="order-items"
      className={`${PAGE_CARD} min-w-0 flex-[3_1_420px] px-5 pt-5 pb-[22px] sm:px-6`}
    >
      <h2 id={titleId} className="mb-1 text-lg font-extrabold text-neutral-900">
        {t("orderPage.items.title")}
      </h2>
      <ul className="m-0 list-none p-0">
        {order.items.map((item) => {
          const dropped = isDropped(item);
          const reduced = isReduced(item);
          const itemNote = note(item);
          const price = `${km(item.unit_price)} / ${item.unit}`;
          const amount = reduced
            ? `${formatAmount(item.ordered_quantity, item.unit)} → ${formatAmount(item.quantity, item.unit)}`
            : formatAmount(item.ordered_quantity, item.unit);
          return (
            <li key={item.id} data-testid="order-item" className="flex items-center gap-3.5 border-b border-neutral-100 py-3.5">
              <ItemThumb item={item} />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/products/${item.product_id}`}
                  data-testid="item-name"
                  className={`${CARD_LINK} text-[15px] font-bold ${dropped ? "text-neutral-500 line-through" : "text-neutral-900"}`}
                >
                  {item.product_name}
                </Link>
                <p className="text-[13px] text-neutral-600">
                  {amount} · {price}
                </p>
                {itemNote && (
                  <p data-testid="item-note" className={`text-xs font-bold ${itemNote.className}`}>
                    {itemNote.text}
                  </p>
                )}
              </div>
              <span
                data-testid="item-total"
                className={`shrink-0 text-[15px] font-extrabold whitespace-nowrap ${dropped ? "text-neutral-500 line-through" : "text-neutral-900"}`}
              >
                {dropped && <span className="sr-only">{t("orderPage.items.notCharged")} </span>}
                {km(dropped ? orderedLineTotal(item) : lineTotal(item))}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-baseline justify-between gap-3 pt-3.5">
        <span className="text-[15px] font-bold text-neutral-900">{t("orderPage.items.total")}</span>
        <span className="flex flex-wrap items-baseline justify-end gap-x-2.5">
          {changed && (
            <span data-testid="old-total" className="text-sm whitespace-nowrap text-neutral-500 line-through">
              <span className="sr-only">{t("myOrders.card.oldTotal")} </span>
              {km(order.ordered_total)}
            </span>
          )}
          <span data-testid="items-total" className="text-[22px] font-extrabold whitespace-nowrap text-neutral-900">
            {km(order.total)}
          </span>
        </span>
      </div>
    </section>
  );
}

export default OrderItemsCard;
