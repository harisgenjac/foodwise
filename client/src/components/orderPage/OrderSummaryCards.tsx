import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ShoppingBag, Store, Wallet } from "lucide-react";
import { ScooterIcon } from "../dashboard/HomeIllustrations.js";
import { formatKm } from "../dashboard/OfferCard.js";
import { formatClock } from "../../utils/delivery.js";
import { deliveryFailedBeforePickup } from "../../utils/orders.js";
import { daysLate, deliveryArrival, deliveryFailed, deliveryFailureText } from "../../utils/orderSteps.js";
import { cardDayTime, courierComing, courierTiming, durationText } from "../../utils/orderPage.js";
import { hoursText } from "../../utils/schedule.js";
import { openState, openStateDetail } from "../../utils/storeHours.js";
import type { OrderDetails } from "../../types/index.js";

interface Tile {
  testId: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}

const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

// The first card: when the restaurant gets the order.
function timeTile(order: OrderDetails, t: TFunction, now: number): Tile {
  const c = (key: string, values: Record<string, unknown> = {}) => t(`orderPage.cards.${key}`, values);
  const isDelivery = order.fulfilment_method === "DELIVERY";
  const closed = order.status === "Rejected" || order.status === "Cancelled";
  const delivery = order.delivery ?? null;
  const tile = (label: string, value: string, sub = ""): Tile => ({
    testId: "time-card",
    icon: isDelivery ? ScooterIcon : ShoppingBag,
    label,
    value,
    sub,
  });
  const arrival = deliveryArrival(order);

  if (closed) {
    const at = isDelivery ? (arrival ?? order.pickup_at) : order.pickup_at;
    return tile(isDelivery ? c("delivery") : c("pickup"), cardDayTime(at, t), c("wontHappen"));
  }
  if (order.status === "Completed") {
    if (isDelivery) {
      const at = delivery?.delivered_at ?? order.steps.delivered_at;
      return tile(c("delivered"), at ? cardDayTime(at, t) : "–", order.delivery_address ?? "");
    }
    const at = order.picked_up_at ?? order.steps.picked_up_at;
    return tile(c("pickedUp"), at ? cardDayTime(at, t) : "–", c("pickedUpSub"));
  }
  if (order.status === "Pending") {
    if (isDelivery) return tile(c("delivery"), arrival ? cardDayTime(arrival, t) : "–", c("ifAccepted"));
    return tile(c("pickup"), cardDayTime(order.pickup_at, t), c("ifAccepted"));
  }
  if (isDelivery) {
    if (deliveryFailedBeforePickup(order)) {
      // Picking it up at the store instead: until when the store is open today, or when it opens.
      const state = openState(order.store.pickup_schedule);
      const value = !state
        ? c("byStoreHours")
        : state.open
          ? c("todayUntil", { time: state.closes })
          : state.opensAt
            ? capitalize(openStateDetail(state, t))
            : c("byStoreHours");
      return { ...tile(c("selfPickup"), value, c("ifYouChoose")), icon: ShoppingBag };
    }
    if (deliveryFailed(order)) return tile(c("delivery"), c("failed"), capitalize(deliveryFailureText(order, t)));
    if (courierComing(order) && arrival) {
      // Counts down to the estimate, "Svakog trenutka" for 5 minutes after it, then how late with the
      // original estimate (the hero shows the moved arrival time).
      const timing = courierTiming(arrival, now);
      const at = c("arrivalAt", { time: formatClock(arrival) });
      if (timing.kind === "in") return tile(c("courierIn"), durationText(timing.minutes, t), at);
      if (timing.kind === "late") {
        return tile(c("courierLate"), durationText(timing.minutes, t), c("dueAt", { time: formatClock(arrival) }));
      }
      return tile(c("courierArriving"), c("now"), at);
    }
    return tile(c("delivery"), arrival ? cardDayTime(arrival, t) : "–", c("findingCourier"));
  }
  // A pickup (also after a failed delivery switched to pickup).
  const hours = hoursText(order.store.pickup_schedule, t);
  const sub = order.is_overdue ? c("late", { count: daysLate(order) }) : hours ? c("pickupHours", { hours }) : "";
  return tile(c("pickup"), cardDayTime(order.pickup_at, t), sub);
}

// The third card: what the restaurant pays (the courier in cash for a delivery) or the total.
function moneyTile(order: OrderDetails, t: TFunction, language: string): Tile {
  const c = (key: string, values: Record<string, unknown> = {}) => t(`orderPage.cards.${key}`, values);
  const km = (value: string | number) => formatKm(Number(value), language);
  const delivery = order.delivery ?? null;
  const tile = (label: string, value: string, sub: string): Tile => ({ testId: "money-card", icon: Wallet, label, value, sub });
  const isDelivery = order.fulfilment_method === "DELIVERY";

  if (
    isDelivery &&
    delivery?.price &&
    !deliveryFailed(order) &&
    (order.status === "Confirmed" || order.status === "InDelivery" || order.status === "Completed")
  ) {
    const cash = delivery.cash_to_collect ?? Number(order.total) + Number(delivery.price);
    const sub = c("goodsPlusDelivery", { goods: km(order.total), delivery: km(delivery.price) });
    return tile(order.status === "Completed" ? c("paidCourier") : c("payCourier"), km(cash), sub);
  }
  const closed = order.status === "Rejected" || order.status === "Cancelled";
  const changed = Math.round(Number(order.total) * 100) !== Math.round(Number(order.ordered_total) * 100);
  let sub = t("orders.itemCount", { count: order.item_count });
  if (closed) sub = c("ordered", { total: km(order.ordered_total) });
  else if (changed) sub = c("was", { total: km(order.ordered_total) });
  else if (isDelivery && order.status === "Pending" && order.delivery_fee_estimate) {
    sub = c("itemsPlusFee", { items: sub, fee: km(order.delivery_fee_estimate) });
  }
  return tile(c("total"), km(order.total), sub);
}

interface OrderSummaryCardsProps {
  order: OrderDetails;
  // Date.now() of this render (the countdown, see useMinuteTick).
  now: number;
}

// The three cards under the hero (design/order-details/): when (a courier's countdown, the pickup
// or delivery time, the real time once done), the store, and the money.
function OrderSummaryCards({ order, now }: OrderSummaryCardsProps) {
  const { t, i18n } = useTranslation();
  const store: Tile = {
    testId: "store-card",
    icon: Store,
    label: t("orderPage.cards.store"),
    value: order.store.business_name ?? "",
    sub: [order.store.address, order.store.city].filter(Boolean).join(", "),
  };
  const tiles = [timeTile(order, t, now), store, moneyTile(order, t, i18n.language)];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {tiles.map(({ testId, icon: Icon, label, value, sub }) => (
        <div
          key={testId}
          data-testid={testId}
          className="flex gap-3 rounded-2xl border border-[#EEEDEB] bg-white p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_4px_16px_rgba(28,25,23,0.04)]"
        >
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-800">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] text-neutral-600">{label}</p>
            <p className="text-lg font-extrabold tracking-[-0.01em] break-words text-neutral-900">{value}</p>
            {sub && <p className="text-[13px] text-neutral-600">{sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default OrderSummaryCards;
