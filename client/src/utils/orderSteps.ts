import type { TFunction } from "i18next";
import type { Order } from "../types/index.js";
import { formatKm } from "../components/dashboard/OfferCard.js";
import { formatClock } from "./delivery.js";
import { dayTitle } from "./dayGroups.js";
import { daysFromToday, toDateInput } from "./expiry.js";
import { changeReasonText, deliveryFailureKey, formatAmount, isDropped, isReduced } from "./orders.js";

// The progress of an order on the restaurant's My orders (design/my-orders/my-orders.html): four
// steps for a pickup (Poslano → Prihvaćeno → Preuzimanje → Preuzeto) and five for a delivery
// (Poslano → Prihvaćeno → Kurir dodijeljen → Kurir preuzeo → Isporučeno). The last step is the
// success seal. A delivery that failed shows a red step: on "Kurir dodijeljen" before the courier
// had the goods, on "Isporučeno" after.

export type StepState = "done" | "current" | "upcoming" | "failed";
// The tone of a step's second line and of its tooltip's title.
export type StepTone = "default" | "waiting" | "danger";

export interface StepInfo {
  title: string;
  tone: StepTone;
  lines: string[];
}

export interface OrderStep {
  key: string;
  label: string;
  state: StepState;
  // The time or a short note under the label ("14:02", "do 15:02", "Čeka kurira").
  detail: string;
  tone: StepTone;
  // The success seal (the last step).
  final: boolean;
  // Shown on hover, focus or tap; only on a step the order has reached.
  info: StepInfo | null;
}

// "14:02" when it is today, otherwise "jučer u 09:46", "sutra u 10:00" or "18. 11. u 14:02".
export const dayAtTime = (value: string, t: TFunction) => {
  const time = formatClock(value);
  const offset = daysFromToday(toDateInput(new Date(value)));
  if (offset === 0) return t("myOrders.time.todayAt", { time });
  if (offset === -1) return t("myOrders.time.yesterdayAt", { time });
  if (offset === 1) return t("myOrders.time.tomorrowAt", { time });
  const date = new Date(value);
  return t("myOrders.time.dateAt", { date: `${date.getDate()}. ${date.getMonth() + 1}.`, time });
};

// "15:02" today, otherwise as dayAtTime ("sutra u 10:00").
const clockOrDay = (value: string, t: TFunction) =>
  daysFromToday(toDateInput(new Date(value))) === 0 ? formatClock(value) : dayAtTime(value, t);

// "Danas · 18:00", "Jučer · 13:30", "Srijeda, 18. novembar · 10:00".
export const dayDotTime = (value: string, t: TFunction) => {
  const day = dayTitle(toDateInput(new Date(value)), t);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${formatClock(value)}`;
};

// Whole days a late pickup is late (its day has passed; a pickup earlier today is not late).
export const daysLate = (order: Pick<Order, "pickup_at">) => Math.max(0, -daysFromToday(toDateInput(new Date(order.pickup_at))));

// No courier is coming and the goods are still at the store, or the courier had them and failed.
export const deliveryFailed = (order: Pick<Order, "fulfilment_method" | "delivery">) =>
  order.fulfilment_method === "DELIVERY" && (order.delivery?.status === "FAILED" || order.delivery?.status === "CANCELLED");

const failedAfterPickup = (order: Pick<Order, "delivery">) => Boolean(order.delivery?.picked_up_at);

// When the restaurant is expected to receive a delivery: the courier's estimate once the store
// accepted, the estimate at sending before that.
export const deliveryArrival = (order: Pick<Order, "delivery" | "delivery_estimated_at">) =>
  order.delivery?.estimated_delivery_at ?? order.delivery_estimated_at ?? null;

// The reason a delivery failed, in words (orders.delivery.failure.<key>).
export const deliveryFailureText = (order: Pick<Order, "delivery">, t: TFunction) =>
  order.delivery ? t(`orders.delivery.failure.${deliveryFailureKey(order.delivery)}`) : "";

export const buildOrderSteps = (order: Order, t: TFunction, language: string): OrderStep[] => {
  const isDelivery = order.fulfilment_method === "DELIVERY";
  const delivery = order.delivery ?? null;
  const money = (value: string | number) => formatKm(Number(value), language);
  const step = (key: string, label: string, state: StepState, extra: Partial<OrderStep> = {}): OrderStep => ({
    key,
    label,
    state,
    detail: "",
    tone: "default",
    final: false,
    info: null,
    ...extra,
  });

  const pending = order.status === "Pending";
  const closed = order.status === "Rejected" || order.status === "Cancelled";
  const completed = order.status === "Completed";

  // 1. Poslano.
  const sentLines = [
    t("myOrders.info.sentAt", { when: dayAtTime(order.created_at, t) }),
    `${t("orders.itemCount", { count: order.item_count })} · ${money(order.ordered_total)}`,
    t(order.accept_partial ? "myOrders.info.partialAllowed" : "myOrders.info.partialNotAllowed"),
  ];
  const steps: OrderStep[] = [
    step("sent", t("myOrders.steps.sent"), "done", {
      detail: formatClock(order.created_at),
      info: { title: t("myOrders.steps.sent"), tone: "default", lines: sentLines },
    }),
  ];

  // 2. Prihvaćeno (while Pending: "Čeka odgovor").
  if (pending) {
    const deadline = order.auto_reject_at;
    steps.push(
      step("accepted", t("myOrders.steps.waiting"), "current", {
        detail: deadline ? t("myOrders.steps.until", { time: formatClock(deadline) }) : "",
        tone: "waiting",
        info: {
          title: t("myOrders.steps.waiting"),
          tone: "waiting",
          lines: [
            ...(deadline ? [t("myOrders.info.answerBy", { time: clockOrDay(deadline, t) })] : []),
            t("myOrders.info.autoReject"),
          ],
        },
      }),
    );
  } else if (closed) {
    // A rejected or cancelled order is not on the Active tab; its steps stop after sending.
    steps.push(step("accepted", t("myOrders.steps.accepted"), "upcoming"));
  } else {
    const when = dayAtTime(order.decided_at ?? order.updated_at, t);
    const lines = [
      order.is_partial
        ? t("myOrders.info.acceptedPartial", { when, accepted: order.accepted_count, count: order.item_count })
        : t("myOrders.info.acceptedAt", { when }),
    ];
    if (order.is_partial) {
      for (const item of order.items) {
        if (!isDropped(item) && !isReduced(item)) continue;
        const reason = changeReasonText(item, t);
        const what = isDropped(item)
          ? t("myOrders.info.itemRejected", { product: item.product_name })
          : t("myOrders.info.itemReduced", {
              product: item.product_name,
              accepted: formatAmount(item.quantity, item.unit),
              ordered: formatAmount(item.ordered_quantity, item.unit),
            });
        lines.push(reason ? `${what}: ${reason}` : what);
      }
      lines.push(t("myOrders.info.newTotal", { total: money(order.total), old: money(order.ordered_total) }));
    }
    if (isDelivery && order.ready_at) lines.push(t("myOrders.info.readyAt", { time: formatClock(order.ready_at) }));
    if (isDelivery && delivery?.price && delivery.cash_to_collect) {
      lines.push(t("myOrders.info.deliveryCash", { price: money(delivery.price), cash: money(delivery.cash_to_collect) }));
    }
    steps.push(
      step("accepted", t("myOrders.steps.accepted"), "done", {
        detail: order.decided_at ? formatClock(order.decided_at) : "",
        info: { title: t("myOrders.steps.accepted"), tone: "default", lines },
      }),
    );
  }
  const accepted = !pending && steps[1]!.state === "done";

  if (!isDelivery) {
    // 3. Preuzimanje.
    const late = order.is_overdue;
    const address = [order.party_address, order.city].filter(Boolean).join(", ");
    const pickupLines = late
      ? [
          t("myOrders.info.pickupWas", { when: dayAtTime(order.pickup_at, t), count: daysLate(order) }),
          ...(address ? [t("myOrders.info.address", { address })] : []),
          t("myOrders.info.storeMayCancel"),
        ]
      : [
          t("myOrders.info.pickupAt", { when: dayAtTime(order.pickup_at, t) }),
          ...(address ? [t("myOrders.info.address", { address })] : []),
        ];
    const pickupInfo: StepInfo = { title: t("myOrders.steps.pickup"), tone: late ? "danger" : "default", lines: pickupLines };
    if (completed) {
      steps.push(step("pickup", t("myOrders.steps.pickup"), "done", { detail: formatClock(order.pickup_at), info: pickupInfo }));
    } else if (accepted && order.status === "Confirmed") {
      steps.push(
        step("pickup", t("myOrders.steps.pickup"), "current", {
          detail: late ? t("myOrders.steps.lateWas", { when: dayAtTime(order.pickup_at, t) }) : dayDotTime(order.pickup_at, t),
          tone: late ? "danger" : "default",
          info: pickupInfo,
        }),
      );
    } else {
      steps.push(step("pickup", t("myOrders.steps.pickup"), "upcoming"));
    }
    // 4. Preuzeto (the seal).
    steps.push(
      step("pickedUp", t("myOrders.steps.pickedUp"), completed ? "done" : "upcoming", {
        final: true,
        detail: completed && order.picked_up_at ? formatClock(order.picked_up_at) : "",
      }),
    );
    return steps;
  }

  // Delivery: 3. Kurir dodijeljen, 4. Kurir preuzeo, 5. Isporučeno.
  const failed = deliveryFailed(order);
  const afterPickup = failed && failedAfterPickup(order);
  const failedInfo = (): StepInfo => ({
    title: t("myOrders.steps.failed"),
    tone: "danger",
    lines: [
      ...(delivery?.failed_at ? [t("myOrders.info.failedAt", { when: dayAtTime(delivery.failed_at, t) })] : []),
      t("myOrders.info.reason", { reason: deliveryFailureText(order, t) }),
      t(afterPickup ? "myOrders.info.failedAfterNext" : "myOrders.info.failedBeforeNext"),
    ],
  });
  const failedStep = (key: string, final: boolean) =>
    step(key, t("myOrders.steps.failed"), "failed", {
      final,
      tone: "danger",
      detail: delivery?.failed_at ? formatClock(delivery.failed_at) : "",
      info: failedInfo(),
    });
  const courier = delivery?.courier_name
    ? [t("myOrders.info.courier", { name: [delivery.courier_name, delivery.courier_phone].filter(Boolean).join(" · ") })]
    : [];
  const assigned = Boolean(delivery && (delivery.courier_assigned_at || delivery.status === "COURIER_ASSIGNED" || delivery.picked_up_at || delivery.status === "DELIVERED"));
  const pickedUp = Boolean(delivery?.picked_up_at);
  const delivered = delivery?.status === "DELIVERED" || completed;

  // 3. Kurir dodijeljen.
  if (failed && !afterPickup) {
    steps.push(failedStep("courierAssigned", false));
  } else if (assigned) {
    steps.push(
      step("courierAssigned", t("myOrders.steps.courierAssigned"), "done", {
        detail: delivery?.courier_assigned_at ? formatClock(delivery.courier_assigned_at) : "",
        info: {
          title: t("myOrders.steps.courierAssigned"),
          tone: "default",
          lines: [
            ...courier,
            ...(delivery?.courier_assigned_at ? [t("myOrders.info.assignedAt", { when: dayAtTime(delivery.courier_assigned_at, t) })] : []),
          ],
        },
      }),
    );
  } else if (accepted && delivery && order.status === "Confirmed") {
    steps.push(
      step("courierAssigned", t("myOrders.steps.courierAssigned"), "current", {
        detail: t("myOrders.steps.waitingCourier"),
        info: {
          title: t("myOrders.steps.courierAssigned"),
          tone: "waiting",
          lines: [
            t("myOrders.info.waitingCourier"),
            ...(order.ready_at ? [t("myOrders.info.readyAt", { time: formatClock(order.ready_at) })] : []),
          ],
        },
      }),
    );
  } else {
    steps.push(step("courierAssigned", t("myOrders.steps.courierAssigned"), "upcoming"));
  }

  // 4. Kurir preuzeo.
  if (pickedUp) {
    const carries = order.items
      .filter((item) => !isDropped(item))
      .map((item) => `${item.product_name} ${formatAmount(item.quantity, item.unit)}`)
      .join(", ");
    steps.push(
      step("courierPickedUp", t("myOrders.steps.courierPickedUp"), "done", {
        detail: formatClock(delivery!.picked_up_at!),
        info: {
          title: t("myOrders.steps.courierPickedUp"),
          tone: "default",
          lines: [
            order.ready_at
              ? t("myOrders.info.pickedUpReady", { time: formatClock(delivery!.picked_up_at!), ready: formatClock(order.ready_at) })
              : t("myOrders.info.pickedUpAt", { time: formatClock(delivery!.picked_up_at!) }),
            t("myOrders.info.carries", { items: carries }),
            ...(delivery?.cash_to_collect ? [t("myOrders.info.cashOnArrival", { cash: money(delivery.cash_to_collect) })] : []),
            ...courier,
          ],
        },
      }),
    );
  } else if (assigned && !failed) {
    // The courier is on the way to the store: when they are expected there (no tooltip on step 4).
    steps.push(
      step("courierPickedUp", t("myOrders.steps.courierPickedUp"), "current", {
        detail: delivery?.estimated_pickup_at ? t("myOrders.steps.arrivesAt", { time: formatClock(delivery.estimated_pickup_at) }) : "",
      }),
    );
  } else {
    steps.push(step("courierPickedUp", t("myOrders.steps.courierPickedUp"), "upcoming"));
  }

  // 5. Isporučeno (the seal).
  const arrival = deliveryArrival(order);
  if (afterPickup) {
    steps.push(failedStep("delivered", true));
  } else if (delivered) {
    steps.push(
      step("delivered", t("myOrders.steps.delivered"), "done", {
        final: true,
        detail: delivery?.delivered_at ? formatClock(delivery.delivered_at) : "",
      }),
    );
  } else if (pickedUp) {
    steps.push(step("delivered", t("myOrders.steps.delivered"), "current", { final: true, detail: arrival ? formatClock(arrival) : "" }));
  } else {
    steps.push(step("delivered", t("myOrders.steps.delivered"), "upcoming", { final: true }));
  }
  return steps;
};

// Which steps show their info: every step reached (done or failed), and the current step when it is
// one of the first three.
export const stepHasInfo = (step: OrderStep, index: number) =>
  step.info !== null && (step.state === "done" || step.state === "failed" || (step.state === "current" && index <= 2));
