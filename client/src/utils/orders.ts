import type { TFunction } from "i18next";
import type { ChangeReason, Order, OrderItem, OrderStatus, SendChange } from "../types/index.js";
import { RESERVATION_STATUS_STYLES } from "./reservationStatus.js";

// The order's short code as people see it: "#K7PM". Unique only within a store, so it is always
// shown with the store's or the restaurant's name.
export const formatOrderCode = (code: string) => `#${code}`;

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = RESERVATION_STATUS_STYLES;

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
