import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Clock } from "lucide-react";
import StoreAvatar from "../store/StoreAvatar.js";
import OrderDecisionModal from "../order/OrderDecisionModal.js";
import { useAuth } from "../../context/AuthContext.js";
import { formatAmount, formatOrderCode } from "../../utils/orders.js";
import { formatNumber } from "../../utils/numbers.js";
import { storeTone } from "../../utils/storeTone.js";
import { dayAndTime } from "../../utils/storeHome.js";
import type { Order } from "../../types/index.js";

// A card lists at most this many items; the rest is "+ još N artikla".
export const ORDER_CARD_ITEMS = 3;
// From this many minutes left the time line turns orange.
const URGENT_MINUTES = 10;

const minutesBetween = (from: number, to: string | Date) => Math.round((new Date(to).getTime() - from) / 60000);


interface OrderCardProps {
  order: Order;
  now: number;
  onAccept: () => void;
  onReject: () => void;
}

// One waiting order: the restaurant, "#K7PM · prije 4 min", the method, "5 artikala · danas u 12:30"
// with the total, at most three items, the answer deadline and Accept / Reject. The cards in a row
// are as tall as the tallest; the deadline and the buttons stay at the bottom.
function StoreHomeOrderCard({ order, now, onAccept, onReject }: OrderCardProps) {
  const { t, i18n } = useTranslation();
  const tone = storeTone(order.restaurant_id ?? order.id);
  const shown = order.items.slice(0, ORDER_CARD_ITEMS);
  const more = order.items.length - shown.length;
  const minutesLeft = order.auto_reject_at ? minutesBetween(now, order.auto_reject_at) : null;
  const urgent = minutesLeft !== null && minutesLeft <= URGENT_MINUTES;
  const delivery = order.fulfilment_method === "DELIVERY";
  const name = order.business_name ?? "";

  return (
    <article
      data-testid="store-home-order"
      aria-labelledby={`store-home-order-${order.id}`}
      className="flex h-full flex-col gap-3.5 rounded-[18px] border border-neutral-100 bg-white p-[18px] shadow-[0_2px_10px_rgba(28,25,23,0.04)]"
    >
      <header className="flex items-center gap-3">
        <StoreAvatar
          store={{ business_name: name, logo_url: order.party_logo_url ?? undefined }}
          decorative
          frameClassName="font-extrabold"
          style={{ backgroundColor: tone.soft, color: tone.strong }}
          className="h-11 w-11 shrink-0 rounded-xl text-base"
        />
        <div className="min-w-0 flex-1 leading-[1.35]">
          <h3 id={`store-home-order-${order.id}`} className="truncate text-base font-extrabold">
            {name}
          </h3>
          <p className="text-[13px] text-neutral-600">
            {formatOrderCode(order.code)} ·{" "}
            {t("storeHome.orders.ago", { count: Math.max(0, -minutesBetween(now, order.created_at)) })}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
            delivery ? "bg-info-100 text-info-700" : "bg-success-100 text-success-800"
          }`}
        >
          {t(delivery ? "storeHome.orders.delivery" : "storeHome.orders.pickup")}
        </span>
      </header>

      <div className="flex items-baseline justify-between gap-3 text-sm text-neutral-600">
        <span>
          {t("storeHome.orders.items", { count: order.item_count })} · {dayAndTime(order.pickup_at, now, t, i18n.language)}
        </span>
        <span className="text-lg font-extrabold whitespace-nowrap text-neutral-900">
          {formatNumber(Number(order.total), i18n.language, 2)} KM
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 border-y border-neutral-100 py-3">
        <ul className="flex flex-col gap-1.5 text-sm">
          {shown.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{item.product_name}</span>
              <span className="shrink-0 text-neutral-600">{formatAmount(item.quantity, item.unit)}</span>
            </li>
          ))}
        </ul>
        {more > 0 && (
          <Link
            to={`/orders/${order.id}`}
            className="inline-flex min-h-11 items-center self-start text-sm font-bold text-brand-800 hover:text-brand-900 sm:min-h-0"
          >
            {t("storeHome.orders.more", { count: more })}
          </Link>
        )}
      </div>

      {minutesLeft !== null && (
        <p
          data-testid="store-home-order-deadline"
          data-urgent={urgent || undefined}
          className={`flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-bold ${
            urgent ? "bg-accent-100 text-accent-700" : "bg-neutral-100 text-neutral-700"
          }`}
        >
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {minutesLeft < 60
            ? t("storeHome.orders.answerIn", { count: Math.max(0, minutesLeft) })
            : t("storeHome.orders.answerBy", { time: dayAndTime(order.auto_reject_at!, now, t, i18n.language) })}
        </p>
      )}

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onAccept}
          aria-label={t("storeHome.orders.acceptLabel", { code: formatOrderCode(order.code), name })}
          className="h-[46px] flex-1 cursor-pointer rounded-full bg-brand-800 text-[15px] font-bold text-white transition-colors hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
        >
          {t("storeHome.orders.accept")}
        </button>
        <button
          type="button"
          onClick={onReject}
          aria-label={t("storeHome.orders.rejectLabel", { code: formatOrderCode(order.code), name })}
          className="h-[46px] flex-1 cursor-pointer rounded-full border-[1.5px] border-neutral-200 bg-white text-[15px] font-bold text-danger-700 transition-colors hover:bg-danger-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
        >
          {t("storeHome.orders.reject")}
        </button>
      </div>
    </article>
  );
}

interface StoreHomeOrdersProps {
  // The most urgent waiting orders (the server picks them); null while loading.
  orders: Order[] | null;
  // Called after a decision is saved: the page loads the next orders and the counts.
  onDecided: () => void;
}

// "Nove narudžbe" on the store home page: up to three waiting orders as equal-height cards and
// "Sve narudžbe →". Accept and Reject open the same decision dialog as the Orders page (Reject on
// its reject step).
function StoreHomeOrders({ orders, onDecided }: StoreHomeOrdersProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const titleId = useId();
  const [deciding, setDeciding] = useState<{ order: Order; step: "decide" | "reject" } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section aria-labelledby={titleId} data-testid="store-home-orders" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-[28px] font-extrabold tracking-[-0.5px]">
            {t("storeHome.orders.title")}
          </h2>
          <p className="mt-0.5 text-[15px] text-neutral-600">{t("storeHome.orders.subtitle")}</p>
        </div>
        <Link
          to="/orders"
          className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-bold text-brand-800 hover:text-brand-900"
        >
          {t("storeHome.orders.all")}
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
        </Link>
      </div>

      {orders === null ? (
        <div aria-busy="true" className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-[18px]">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-[340px] animate-pulse rounded-[18px] bg-neutral-100" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <p
          data-testid="store-home-orders-empty"
          className="rounded-[18px] border border-dashed border-neutral-200 bg-white px-5 py-8 text-center text-[15px] text-neutral-600"
        >
          {t("storeHome.orders.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] items-stretch gap-[18px]">
          {orders.map((order) => (
            <StoreHomeOrderCard
              key={order.id}
              order={order}
              now={now}
              onAccept={() => setDeciding({ order, step: "decide" })}
              onReject={() => setDeciding({ order, step: "reject" })}
            />
          ))}
        </div>
      )}

      {deciding && (
        <OrderDecisionModal
          order={deciding.order}
          restaurant={deciding.order.business_name ?? ""}
          initialStep={deciding.step}
          onClose={() => setDeciding(null)}
          onDecided={onDecided}
          {...(user?.preparation_minutes && { preparationMinutes: user.preparation_minutes })}
        />
      )}
    </section>
  );
}

export default StoreHomeOrders;
