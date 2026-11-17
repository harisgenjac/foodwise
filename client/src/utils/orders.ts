import type { TFunction } from "i18next";
import type { ChangeReason, Order, OrderDelivery, OrderDetails, OrderItem, OrderStatus, SendChange } from "../types/index.js";

// The order's short code as people see it: "#K7PM". Unique only within a store, so it is always
// shown with the store's or the restaurant's name.
export const formatOrderCode = (code: string) => `#${code}`;

// Order and item statuses share these pills.
export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Confirmed: "bg-green-50 text-green-700",
  Completed: "bg-gray-100 text-gray-700",
  Rejected: "bg-red-50 text-red-600",
  Cancelled: "bg-red-50 text-red-600",
};

export const CHANGE_REASONS: ChangeReason[] = ["NOT_ENOUGH_STOCK", "QUALITY", "OTHER"];

// A note may be at most this long (orders.change_note).
export const MAX_CHANGE_NOTE = 300;

export const formatMoney = (amount: number | string) => `${Number(amount).toFixed(2)} KM`;

// "15 kg", "2.5 l": the amount without trailing zeros and the unit's short code.
export const formatAmount = (quantity: number | string, unit: string) => `${parseFloat(String(quantity))} ${unit}`;

// A line the store rejected or that was cancelled: it no longer counts.
export const isDropped = (item: Pick<OrderItem, "status">) => item.status === "Rejected" || item.status === "Cancelled";

// A line the store accepted with less than ordered.
export const isReduced = (item: Pick<OrderItem, "status" | "quantity" | "ordered_quantity">) =>
  !isDropped(item) && Number(item.quantity) < Number(item.ordered_quantity);

// What a line costs now (nothing once dropped) and what it cost when sent.
export const lineTotal = (item: OrderItem) => (isDropped(item) ? 0 : Number(item.unit_price) * Number(item.quantity));
export const orderedLineTotal = (item: OrderItem) => Number(item.unit_price) * Number(item.ordered_quantity);

// The products of an order in one line: "Piletina 15 kg", "Piletina 15 kg + 2 više".
export const itemsSummary = (order: Pick<Order, "items">, t: TFunction) => {
  const [first, ...rest] = order.items;
  if (!first) return "";
  const head = `${first.product_name} ${formatAmount(first.quantity, first.unit)}`;
  return rest.length > 0 ? t("orders.moreItems", { first: head, count: rest.length }) : head;
};

// The reason of a changed line, in words: "nema dovoljno na stanju", or the store's own note.
export const changeReasonText = (item: Pick<OrderItem, "change_reason" | "change_note">, t: TFunction) => {
  if (!item.change_reason) return null;
  if (item.change_reason === "OTHER" && item.change_note) return item.change_note;
  return t(`orders.reasons.${item.change_reason}`);
};

// One change made at sending, for the confirmation step and the details:
// "Piletina: 15 kg umjesto 20 kg, nema više na stanju".
export const sendChangeText = (change: SendChange, t: TFunction) => {
  const values = {
    product: change.name,
    requested: formatAmount(change.requested, change.unit),
    sent: formatAmount(change.sent, change.unit),
    oldPrice: formatMoney(change.old_price),
    newPrice: formatMoney(change.new_price),
  };
  return t(`orders.sendChanges.${change.kind}`, values);
};

// The job rejected the order because the store did not answer in time: the only change to
// Rejected the system makes (expiry and cascades cancel).
export const autoRejected = (order: Pick<OrderDetails, "status" | "history">) =>
  order.status === "Rejected" &&
  order.history.some((entry) => entry.item_id === null && entry.to_status === "Rejected" && entry.source === "SYSTEM");

// No courier is coming and the goods are still at the store: the restaurant of an accepted
// delivery order then picks it up itself or cancels it (POST /orders/:id/switch-to-pickup,
// /cancel-failed-delivery).
export const deliveryFailedBeforePickup = (order: Pick<Order, "status" | "fulfilment_method" | "delivery">) =>
  order.status === "Confirmed" &&
  order.fulfilment_method === "DELIVERY" &&
  (order.delivery?.status === "FAILED" || order.delivery?.status === "CANCELLED") &&
  !order.delivery.picked_up_at;

// The orders.delivery.failure.<key> that says why a delivery failed or was cancelled.
export const deliveryFailureKey = (delivery: OrderDelivery) => {
  if (delivery.status === "CANCELLED") return delivery.failure_reason === "CANCELLED_BY_ADMIN" ? "admin" : "cancelled";
  if (delivery.picked_up_at) return "afterPickup";
  if (delivery.failure_reason === "OUT_OF_ZONE") return "OUT_OF_ZONE";
  // Without a price it was never created; with one, the courier failed.
  return delivery.price ? "courier" : "other";
};
