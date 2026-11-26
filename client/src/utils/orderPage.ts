import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import type { Order, OrderDetails } from "../types/index.js";
import { formatClock } from "./delivery.js";
import { deliveryFailedBeforePickup } from "./orders.js";
import { daysFromToday, toDateInput } from "./expiry.js";
import {
  arrivalForTiming,
  autoRejectedOrder,
  courierTiming,
  delayedArrival,
  LATE_GRACE_MINUTES,
  minutesSince,
  minutesUntil,
  type CourierTiming,
  cancelInfo,
  clockOrDay,
  dayAtTime,
  dayDotTime,
  deliveryArrival,
  deliveryFailed,
  deliveryFailureText,
  rejectionReason,
} from "./orderSteps.js";

// The restaurant's order page (design/order-details/): what the hero says for each state of the
// order, and the countdown to a courier's arrival.

// The colour of the hero's sentence: white, yellow while the store has not answered, lime once the
// order is done; a failure (failed delivery, late pickup, rejected, cancelled) is white with a coral
// "!" in front and the line under it in peach.
export type HeadlineTone = "default" | "waiting" | "done" | "failure";

export interface Headline {
  title: string;
  line: string;
  tone: HeadlineTone;
}

// The order page's data as the shared list helpers (steps, pills, thumbnails) take it: the store's
// name, city and address as on the restaurant's lists.
export const listOrder = (order: OrderDetails): Order => ({
  ...order,
  business_name: order.store.business_name ?? "",
  city: order.store.city,
  party_address: order.store.address,
  party_logo_url: order.store.logo_url,
});

// The courier's timing lives in orderSteps.ts (the steps show it too); re-exported for the page.
export { courierTiming, delayedArrival, LATE_GRACE_MINUTES, minutesSince, minutesUntil };
export type { CourierTiming };

// The arrival time to show next to the timing: the estimate, or the moved one once late.
const shownArrival = (arrival: string, timing: CourierTiming) => formatClock(arrivalForTiming(arrival, timing));

// "7 min", "2 h", "1 h 15 min".
export const durationText = (minutes: number, t: TFunction) => {
  if (minutes < 60) return t("orderPage.duration.minutes", { minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? t("orderPage.duration.hours", { hours }) : t("orderPage.duration.hoursMinutes", { hours, minutes: rest });
};

// Renders again every minute, so a countdown computed from Date.now() stays current (a live update
// renders it again at once with the new estimate).
export function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  return Date.now();
}

// A courier is assigned (and the delivery has not failed or finished): the time card counts down.
export const courierComing = (order: OrderDetails) => {
  const delivery = order.delivery;
  if (order.fulfilment_method !== "DELIVERY" || !delivery || deliveryFailed(order)) return false;
  return delivery.status === "COURIER_ASSIGNED" || delivery.status === "PICKED_UP";
};

// "Stiže za 12 min" / "Stiže svakog trenutka" / "Kasni 7 min".
const arrivesIn = (timing: CourierTiming, t: TFunction) => {
  if (timing.kind === "in") return t("orderPage.headline.arrivesIn", { duration: durationText(timing.minutes, t) });
  if (timing.kind === "late") return t("orderPage.headline.courierLate", { duration: durationText(timing.minutes, t) });
  return t("orderPage.headline.arrivesNow");
};

// "u restoranu za 40 min (12:00)" / "u restoranu svakog trenutka (12:00)" / "u restoranu kasni 7 min (12:07)".
const atRestaurant = (arrival: string, now: number, t: TFunction) => {
  const timing = courierTiming(arrival, now);
  const time = shownArrival(arrival, timing);
  if (timing.kind === "in") return t("orderPage.headline.atRestaurantIn", { duration: durationText(timing.minutes, t), time });
  if (timing.kind === "late") return t("orderPage.headline.atRestaurantLate", { duration: durationText(timing.minutes, t), time });
  return t("orderPage.headline.atRestaurantNow", { time });
};

export const orderHeadline = (order: OrderDetails, t: TFunction, now: number): Headline => {
  const h = (key: string, values: Record<string, unknown> = {}) => t(`orderPage.headline.${key}`, values);
  const items = t("orderPage.headline.itemsAccepted", { accepted: order.accepted_count, count: order.item_count });

  if (order.status === "Pending") {
    return {
      title: h("pending"),
      line: order.auto_reject_at ? h("pendingLine", { time: clockOrDay(order.auto_reject_at, t) }) : h("pendingNoDeadline"),
      tone: "waiting",
    };
  }

  if (order.status === "Rejected") {
    const reason = rejectionReason(order, t);
    const when = dayAtTime(order.steps.decided_at ?? order.decided_at ?? order.updated_at, t);
    const line = autoRejectedOrder(order, order) ? h("autoRejected") : reason ? h("reason", { reason }) : h("rejectedAt", { when });
    return { title: h("rejected"), line, tone: "failure" };
  }

  if (order.status === "Cancelled") {
    const cancel = cancelInfo(order);
    const when = dayAtTime(order.steps.cancelled_at ?? order.steps.finished_at ?? order.updated_at, t);
    return {
      title: h(`cancelled.${cancel.by}`),
      line: cancel.reason ? h("reason", { reason: cancel.reason }) : h("cancelledAt", { when }),
      tone: "failure",
    };
  }

  const isDelivery = order.fulfilment_method === "DELIVERY";
  const delivery = order.delivery ?? null;

  if (order.status === "Completed") {
    if (isDelivery) {
      const at = delivery?.delivered_at ?? order.steps.delivered_at ?? order.steps.finished_at;
      return { title: h("delivered"), line: at ? h("deliveredLine", { when: dayAtTime(at, t) }) : "", tone: "done" };
    }
    const at = order.picked_up_at ?? order.steps.picked_up_at ?? order.steps.finished_at;
    return { title: h("pickedUp"), line: at ? h("pickedUpLine", { when: dayAtTime(at, t) }) : "", tone: "done" };
  }

  if (isDelivery) {
    if (deliveryFailed(order)) {
      const reason = deliveryFailureText(order, t);
      const line = deliveryFailedBeforePickup(order) ? h("failedBefore", { reason }) : h("failedAfter", { reason });
      return { title: h("deliveryFailed"), line: `${line.charAt(0).toUpperCase()}${line.slice(1)}`, tone: "failure" };
    }
    const arrival = deliveryArrival(order);
    if (delivery?.picked_up_at || delivery?.status === "PICKED_UP") {
      const timing = arrival ? courierTiming(arrival, now) : null;
      const line =
        arrival && timing
          ? `${arrivesIn(timing, t)} · ${h("arrivalAt", { time: shownArrival(arrival, timing) })}`
          : h("courierHasGoods");
      return { title: h("onTheWay"), line, tone: "default" };
    }
    if (delivery?.status === "COURIER_ASSIGNED") {
      const parts = [
        ...(delivery.estimated_pickup_at ? [h("courierToStore", { time: formatClock(delivery.estimated_pickup_at) })] : []),
        ...(arrival ? [atRestaurant(arrival, now, t)] : []),
      ];
      return { title: h("courierAssigned"), line: parts.join(" · "), tone: "default" };
    }
    // Accepted; the delivery service is looking for a courier.
    const ready = order.ready_at ? h("readyAt", { time: formatClock(order.ready_at) }) : "";
    return order.is_partial
      ? { title: h("partial"), line: `${items} · ${h("findingCourier")}`, tone: "default" }
      : { title: h("accepted"), line: [h("findingCourierLong"), ready].filter(Boolean).join(" · "), tone: "default" };
  }

  // A pickup order (also one the restaurant switched to pickup after a failed delivery).
  const when = dayAtTime(order.pickup_at, t);
  if (order.is_overdue) return { title: h("late"), line: h("lateLine", { when }), tone: "failure" };
  if (order.steps.switched_to_pickup_at || delivery) {
    return { title: h("switchedToPickup"), line: h("pickupLine", { when }), tone: "default" };
  }
  if (order.is_partial) return { title: h("partial"), line: `${items} · ${h("pickupLower", { when })}`, tone: "default" };
  return { title: h("accepted"), line: h("pickupLine", { when }), tone: "default" };
};

// The time card's day and time: "Danas · 18:00", "Jučer · 13:30", "Sutra · 10:00", else
// "22. 11. · 18:28" (a weekday and month in words do not fit the card).
export const cardDayTime = (value: string, t: TFunction) => {
  const offset = daysFromToday(toDateInput(new Date(value)));
  if (Math.abs(offset) <= 1) return dayDotTime(value, t);
  const date = new Date(value);
  return `${date.getDate()}. ${date.getMonth() + 1}. · ${formatClock(value)}`;
};
