import type { PoolClient } from "pg";
import { HttpError } from "../../utils/httpError.js";
import { parseId, parseNumber } from "../../utils/params.js";
import { createNotification } from "../../utils/notifications.js";
import { absorbShopShortage, markSoldIfFullyConfirmed } from "../stock.js";
import { formatOrderCode } from "./codes.js";
import { lockOrder, lockOrderItems, recordItemChanges, syncOrderStatus, type ItemRow } from "./status.js";

// The store's decision on a Pending order (docs/orders-design.md, section 6): every Pending item is
// accepted, accepted with a smaller quantity or rejected, in one step; or the whole order is
// rejected. A smaller quantity or a rejection needs a reason, and with "not enough in stock" the
// freed amount can be recorded as sold in the shop.

export const CHANGE_REASONS = ["NOT_ENOUGH_STOCK", "QUALITY", "OTHER"] as const;
export type ChangeReason = (typeof CHANGE_REASONS)[number];
export const MAX_NOTE_LENGTH = 300;

const REASON_ERROR = "Choose a reason.";
const NOTE_ERROR = `Describe the reason (at most ${MAX_NOTE_LENGTH} characters).`;
const SHOP_SALE_ERROR = "The amount sold in the shop is not valid.";
const DECIDE_ALL_ERROR = "Decide every item of the order.";

type Action = "ACCEPT" | "ACCEPT_LESS" | "REJECT";

interface ItemDecision {
  item: ItemRow;
  action: Action;
  // The accepted quantity (the ordered one for ACCEPT, 0 for REJECT).
  quantity: number;
  reason: ChangeReason | null;
  note: string | null;
  shopSale: number;
}

interface Reason {
  reason: ChangeReason | null;
  note: string | null;
}

// A reason with its note: OTHER needs a note; any note is at most 300 characters.
const parseReason = (value: unknown, noteValue: unknown): Reason => {
  if (typeof value !== "string" || !(CHANGE_REASONS as readonly string[]).includes(value)) {
    throw new HttpError(400, REASON_ERROR);
  }
  if (noteValue !== undefined && noteValue !== null && typeof noteValue !== "string") {
    throw new HttpError(400, NOTE_ERROR);
  }
  const note = typeof noteValue === "string" ? noteValue.trim() : "";
  if ((value === "OTHER" && note === "") || note.length > MAX_NOTE_LENGTH) {
    throw new HttpError(400, NOTE_ERROR);
  }
  return { reason: value as ChangeReason, note: note === "" ? null : note };
};

// A shop sale only with "not enough in stock", above 0 and at most what the decision frees.
const parseShopSale = (value: unknown, reason: ChangeReason | null, freed: number) => {
  if (value === undefined || value === null || value === "" || value === 0) return 0;
  const amount = parseNumber(value);
  if (reason !== "NOT_ENOUGH_STOCK" || amount === null || amount <= 0 || amount > freed) {
    throw new HttpError(400, SHOP_SALE_ERROR);
  }
  return amount;
};

const parseDecisions = (
  body: Record<string, unknown>,
  pendingItems: ItemRow[],
  acceptPartial: boolean,
): ItemDecision[] => {
  if (body.reject_order === true) {
    const { reason, note } = parseReason(body.reason, body.note);
    const sales = body.shop_sales ?? [];
    if (!Array.isArray(sales)) throw new HttpError(400, SHOP_SALE_ERROR);
    const saleByProduct = new Map<number, number>();
    for (const entry of sales as unknown[]) {
      const sale = (entry ?? {}) as Record<string, unknown>;
      const productId = parseId(sale.product_id);
      const item = pendingItems.find((candidate) => candidate.product_id === productId);
      if (!item || saleByProduct.has(item.product_id)) throw new HttpError(400, SHOP_SALE_ERROR);
      saleByProduct.set(item.product_id, parseShopSale(sale.quantity, reason, parseFloat(item.quantity)));
    }
    return pendingItems.map((item) => ({
      item,
      action: "REJECT",
      quantity: 0,
      reason,
      note,
      shopSale: saleByProduct.get(item.product_id) ?? 0,
    }));
  }

  const entries = body.items;
  if (!Array.isArray(entries) || entries.length !== pendingItems.length) {
    throw new HttpError(400, DECIDE_ALL_ERROR);
  }
  const decided = new Set<number>();
  const decisions: ItemDecision[] = [];
  for (const raw of entries as unknown[]) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const itemId = parseId(entry.item_id);
    const item = pendingItems.find((candidate) => candidate.id === itemId);
    if (!item || decided.has(item.id)) throw new HttpError(400, DECIDE_ALL_ERROR);
    decided.add(item.id);
    const ordered = parseFloat(item.quantity);
    const action = entry.action;
    if (action === "ACCEPT") {
      decisions.push({ item, action, quantity: ordered, reason: null, note: null, shopSale: 0 });
      continue;
    }
    if (action !== "ACCEPT_LESS" && action !== "REJECT") throw new HttpError(400, DECIDE_ALL_ERROR);
    if (!acceptPartial) {
      throw new HttpError(400, "This order must be accepted in full or rejected.");
    }
    let quantity = 0;
    if (action === "ACCEPT_LESS") {
      const accepted = parseNumber(entry.quantity);
      if (accepted === null || accepted <= 0 || accepted >= ordered) {
        throw new HttpError(400, "The accepted quantity must be more than zero and less than ordered.");
      }
      quantity = accepted;
    }
    const { reason, note } = parseReason(entry.reason, entry.note);
    const shopSale = parseShopSale(entry.record_shop_sale, reason, ordered - quantity);
    decisions.push({ item, action, quantity, reason, note, shopSale });
  }
  return decisions;
};

// The amount as it reads in a message: "2 kg", "2.5 kg".
const amountText = (value: number, unit: string) => `${Math.round(value * 1000) / 1000} ${unit}`;

// The till sold food that Pending items hold (products.shop_shortage): an item can accept at most
// its quantity minus the shortage, so the store reduces or rejects it. Without partial fulfilment
// the whole order must then be rejected.
const checkShopShortage = (decisions: ItemDecision[], acceptPartial: boolean) => {
  for (const decision of decisions) {
    const shortage = parseFloat(decision.item.shop_shortage);
    if (shortage <= 0 || decision.action === "REJECT") continue;
    const ordered = parseFloat(decision.item.quantity);
    const max = ordered - shortage;
    if (decision.quantity <= max) continue;
    const product = decision.item.product_name;
    if (!acceptPartial) {
      const left = amountText(Math.max(max, 0), decision.item.unit);
      throw new HttpError(400, `This order must be rejected: ${product} was sold in your shop (only ${left} left).`);
    }
    if (max <= 0) {
      throw new HttpError(400, `Not enough in stock for ${product}: it was sold in your shop and must be rejected.`);
    }
    const maxText = amountText(max, decision.item.unit);
    throw new HttpError(
      400,
      `Not enough in stock for ${product}: at most ${maxText} can be accepted after the sale in your shop. Accept less or reject it.`,
    );
  }
};

// The decision inside the caller's transaction. `storeId` must own the order (anyone else: 404).
export const decideOrder = async (
  client: PoolClient,
  storeId: number,
  orderId: number,
  body: Record<string, unknown>,
) => {
  const order = await lockOrder(client, orderId);
  if (!order || order.store_id !== storeId) {
    throw new HttpError(404, "Order not found.");
  }
  if (order.status !== "Pending") {
    throw new HttpError(400, "Only pending orders can be accepted or rejected.");
  }
  const items = await lockOrderItems(client, orderId);
  const pendingItems = items.filter((item) => item.status === "Pending");
  const decisions = parseDecisions(body, pendingItems, order.accept_partial);
  if (decisions.some((decision) => decision.action !== "REJECT" && decision.item.is_expired)) {
    throw new HttpError(400, "An expired product cannot be accepted.");
  }
  checkShopShortage(decisions, order.accept_partial);

  for (const decision of decisions) {
    await client.query(
      `UPDATE reservations
       SET status = $2, quantity = $3, decided_at = NOW(), change_reason = $4, change_note = $5
       WHERE reservations.id = $1`,
      [
        decision.item.id,
        decision.action === "REJECT" ? "Rejected" : "Confirmed",
        // A rejected item keeps its quantity for history; its status frees it.
        decision.action === "REJECT" ? decision.item.quantity : decision.quantity,
        decision.reason,
        decision.note,
      ],
    );
  }
  // Shop sales take the amount the decision just freed.
  for (const decision of decisions.filter((entry) => entry.shopSale > 0)) {
    await client.query(
      `INSERT INTO product_shop_sales (product_id, store_id, quantity, created_by, order_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [decision.item.product_id, order.store_id, decision.shopSale, storeId, order.id],
    );
    // The till's shortage is what the store means when it records the difference: it is covered.
    await client.query(
      "UPDATE products SET shop_shortage = GREATEST(products.shop_shortage - $2, 0) WHERE products.id = $1",
      [decision.item.product_id, decision.shopSale],
    );
  }
  // What the till already sold of the quantity this decision freed becomes a shop sale by itself.
  for (const decision of decisions) {
    await absorbShopShortage(client, decision.item.product_id, { orderId: order.id, actorId: storeId });
  }
  for (const decision of decisions) {
    if (decision.action === "REJECT" && decision.shopSale === 0) continue;
    await markSoldIfFullyConfirmed(client, {
      id: decision.item.product_id,
      store_id: decision.item.store_id,
      name: decision.item.product_name,
      quantity: decision.item.product_quantity,
    });
  }

  const event = { source: "STORE" as const, actorId: storeId };
  // Item rows only when the items did not all simply get accepted or all rejected.
  const uniform =
    decisions.every((decision) => decision.action === "ACCEPT") ||
    decisions.every((decision) => decision.action === "REJECT");
  if (!uniform) {
    await recordItemChanges(
      client,
      order.id,
      decisions.map((decision) => ({
        id: decision.item.id,
        from: "Pending",
        to: decision.action === "REJECT" ? "Rejected" : "Confirmed",
      })),
      event,
    );
  }
  await client.query("UPDATE orders SET decided_at = NOW() WHERE orders.id = $1", [order.id]);
  const updated = await syncOrderStatus(client, order.id, event);

  const code = formatOrderCode(order.code);
  const changed = decisions.some((decision) => decision.action !== "ACCEPT");
  const notification =
    updated.status === "Rejected"
      ? { type: "ORDER_REJECTED" as const, message: `Your order ${code} was rejected.` }
      : changed
        ? { type: "ORDER_PARTIALLY_ACCEPTED" as const, message: `Your order ${code} was partly accepted.` }
        : { type: "ORDER_ACCEPTED" as const, message: `Your order ${code} was accepted.` };
  await createNotification(client, { userId: order.restaurant_id, orderId: order.id, ...notification });
  return updated;
};
