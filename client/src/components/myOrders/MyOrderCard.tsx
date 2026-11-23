import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, ShoppingBag } from "lucide-react";
import StoreAvatar from "../store/StoreAvatar.js";
import { ScooterIcon } from "../dashboard/HomeIllustrations.js";
import { formatKm } from "../dashboard/OfferCard.js";
import AnswerDeadline from "../order/AnswerDeadline.js";
import OrderItemThumbnails from "../order/OrderItemThumbnails.js";
import { OrderStatusPill } from "../storePage/StoreOrdersTab.js";
import OrderSteps from "./OrderSteps.js";
import { formatRelativeTime } from "../../utils/notifications.js";
import { formatClock } from "../../utils/delivery.js";
import { daysFromToday, toDateInput } from "../../utils/expiry.js";
import { deliveryFailedBeforePickup, formatOrderCode, itemsSummary } from "../../utils/orders.js";
import { buildOrderSteps, dayDotTime, deliveryArrival, deliveryFailed, deliveryFailureText } from "../../utils/orderSteps.js";
import { storeTone } from "../../utils/storeTone.js";
import type { Order } from "../../types/index.js";

export const CARD_CLASS =
  "rounded-[20px] border border-[#EEEDEB] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04),0_4px_16px_rgba(28,25,23,0.04)]";

interface MyOrderCardProps {
  order: Order;
  // Opens the cancel confirmation (Pending orders only).
  onCancel: (order: Order) => void;
}

// "poslano 14:02 (prije 12 min)", "poslano jučer 09:46 (prije 1 dan)".
function sentText(order: Order, t: ReturnType<typeof useTranslation>["t"], language: string) {
  const offset = daysFromToday(toDateInput(new Date(order.created_at)));
  const time = formatClock(order.created_at);
  const date = new Date(order.created_at);
  const when = offset === 0 ? time : offset === -1 ? t("myOrders.card.yesterday", { time }) : `${date.getDate()}. ${date.getMonth() + 1}. ${time}`;
  // "prije 12 min" up to a week; older orders show only the date.
  if (offset < -6) return t("myOrders.card.sentOn", { when });
  const ago = formatRelativeTime(order.created_at, t, language);
  return t("myOrders.card.sent", { when, ago: `${ago.charAt(0).toLowerCase()}${ago.slice(1)}` });
}

// One active order on My orders (design/my-orders/my-orders.html): the store's avatar and name, the
// code and when it was sent, "Kasni" and the status pill; the steps; the store's answer deadline or
// the failed-delivery note; and the bottom row with the products, the pickup or delivery time, the
// total (the old one struck through after a partial acceptance), "Otkaži" while Pending and
// "Detalji →".
function MyOrderCard({ order, onCancel }: MyOrderCardProps) {
  const { t, i18n } = useTranslation();
  const code = formatOrderCode(order.code);
  const tone = storeTone(order.store_id);
  const isDelivery = order.fulfilment_method === "DELIVERY";
  const failed = deliveryFailed(order);
  const arrival = deliveryArrival(order);
  const late = order.is_overdue;
  const steps = buildOrderSteps(order, t, i18n.language);
  const storeName = order.business_name ?? "";

  let when = dayDotTime(order.pickup_at, t);
  if (isDelivery) when = failed ? t("myOrders.card.failed") : arrival ? dayDotTime(arrival, t) : "";
  const whenDanger = late || failed;

  return (
    <article data-testid="my-order-card" aria-labelledby={`order-${order.id}-title`} className={`${CARD_CLASS} flex flex-col gap-[18px] px-4 py-5 sm:px-6`}>
      <div className="flex flex-wrap items-center gap-3.5">
        <StoreAvatar
          store={{ business_name: storeName, logo_url: order.party_logo_url ?? undefined }}
          decorative
          frameClassName="font-extrabold"
          style={{ backgroundColor: tone.soft, color: tone.strong }}
          className="h-11 w-11 rounded-[14px] text-[15px]"
        />
        <div className="min-w-0 flex-[1_1_240px]">
          <h2 id={`order-${order.id}-title`} className="text-[17px] font-extrabold text-neutral-900">
            <Link
              to={`/stores/${order.store_id}`}
              className="rounded-sm hover:text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
            >
              {storeName}
            </Link>
          </h2>
          <p className="mt-0.5 text-[13px] text-neutral-600">
            {t("myOrders.card.order")} <strong className="font-bold text-neutral-900">{code}</strong> · {sentText(order, t, i18n.language)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {late && (
            <span
              data-testid="late-badge"
              className="inline-flex h-7 items-center gap-1 rounded-full bg-danger-700 px-2.5 text-xs font-bold whitespace-nowrap text-white"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {t("pickups.overdueToday")}
            </span>
          )}
          <OrderStatusPill order={order} />
        </div>
      </div>

      <OrderSteps steps={steps} label={t("myOrders.steps.label", { code })} />

      <AnswerDeadline order={order} viewer="RESTAURANT" boxed />
      {deliveryFailedBeforePickup(order) && (
        <p
          data-testid="delivery-failed-note"
          className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-[13px] font-semibold text-danger-700"
        >
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
          {t("myOrders.card.failedNote", { reason: deliveryFailureText(order, t) })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[14px] bg-neutral-50 px-4 py-3.5">
        <div className="flex min-w-0 flex-[1_1_220px] items-center gap-2.5">
          <OrderItemThumbnails order={order} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-neutral-900" title={itemsSummary(order, t)}>
              {itemsSummary(order, t)}
            </p>
            <p className="text-xs text-neutral-600">{t("orders.itemCount", { count: order.item_count })}</p>
          </div>
        </div>
        <div className="shrink-0">
          <p className="flex items-center gap-1 text-xs text-neutral-600">
            {isDelivery ? (
              <ScooterIcon className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {isDelivery ? t("myOrders.method.delivery") : t("myOrders.method.pickup")}
          </p>
          <p data-testid="order-when" className={`text-[15px] font-extrabold ${whenDanger ? "text-danger-700" : "text-neutral-900"}`}>
            {when}
          </p>
        </div>
        <div className="shrink-0">
          <p className="text-xs text-neutral-600">{t("myOrders.card.total")}</p>
          <p className="text-[15px] font-extrabold whitespace-nowrap text-neutral-900">{formatKm(Number(order.total), i18n.language)}</p>
          {order.is_partial && (
            <p data-testid="old-total" className="text-xs whitespace-nowrap text-neutral-500 line-through">
              <span className="sr-only">{t("myOrders.card.oldTotal")} </span>
              {formatKm(Number(order.ordered_total), i18n.language)}
            </p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          {order.status === "Pending" && (
            <button
              type="button"
              onClick={() => onCancel(order)}
              aria-label={t("myOrders.card.cancelLabel", { code })}
              className="inline-flex h-11 cursor-pointer items-center rounded-full border border-danger-200 bg-white px-[18px] text-sm font-bold text-danger-700 hover:bg-danger-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-danger-300"
            >
              {t("orders.cancelShortButton")}
            </button>
          )}
          <Link
            to={`/orders/${order.id}`}
            aria-label={t("storePage.orders.detailsLabel", { code })}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-brand-50 px-[18px] text-sm font-bold text-brand-800 hover:bg-brand-100 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300"
          >
            {t("storePage.orders.details")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export default MyOrderCard;
