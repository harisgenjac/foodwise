import type { PoolClient } from "pg";
import { HttpError } from "../../utils/httpError.js";
import { isValidDateTime } from "../../utils/dates.js";
import { parseId, parseNumber } from "../../utils/params.js";
import { visibleStore } from "../../utils/visibility.js";
import { createNotification } from "../../utils/notifications.js";
import { freeQuantity } from "../stock.js";
import { formatOrderCode, insertOrder, type OrderRow } from "./codes.js";
import { recordOrderCreated } from "./status.js";

// Sending an order (docs/orders-design.md, section 5): one transaction with the stock protection,
// where accepting partial fulfilment already applies to what can be sent.

// At most this many Pending orders per restaurant across all stores (without credits nothing
// else stops a restaurant from flooding stores with orders).
export const MAX_PENDING_ORDERS = 10;
// Lines per order (and per cart).
export const MAX_ORDER_ITEMS = 30;
// The first key of the restaurant's transaction-scoped advisory lock (the second is its id).
const PENDING_LOCK_NAMESPACE = 41;

export type SendChangeKind = "QUANTITY_REDUCED" | "PRICE_LOWERED" | "NOT_SENT_SOLD_OUT" | "NOT_SENT_PRICE_RAISED";

// One entry of orders.send_changes: what sending changed on a line, for the confirmation screen.
export interface SendChange {
  product_id: number;
  name: string;
  unit: string;
  kind: SendChangeKind;
  requested: number;
  sent: number;
  old_price: number;
  new_price: number;
}

interface SendLine {
  productId: number;
  quantity: number;
  unitPrice: number;
}

export interface SendOrderInput {
  pickupAt: string;
  acceptPartial: boolean;
  lines: SendLine[];
}

export const PENDING_LIMIT_ERROR = `You have too many orders waiting for an answer (${MAX_PENDING_ORDERS}). Wait for the stores to respond or cancel one.`;

// Validates the body of POST /orders. Throws an HttpError with the first problem.
export const parseSendOrderBody = (body: Record<string, unknown>): SendOrderInput => {
  const { fulfilment_method, pickup_at, accept_partial, items } = body;
  if (fulfilment_method !== undefined && fulfilment_method !== "PICKUP") {
    throw new HttpError(400, "Fulfilment method is not valid.");
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ORDER_ITEMS) {
    throw new HttpError(400, `An order must have between 1 and ${MAX_ORDER_ITEMS} items.`);
  }
  if (accept_partial !== undefined && typeof accept_partial !== "boolean") {
    throw new HttpError(400, "Invalid request format.");
  }
  const lines: SendLine[] = [];
  for (const item of items as unknown[]) {
    const line = (item ?? {}) as Record<string, unknown>;
    const productId = parseId(line.product_id);
    if (productId === null) {
      throw new HttpError(404, "Product not found.");
    }
    const quantity = parseNumber(line.quantity);
    if (quantity === null || quantity <= 0) {
      throw new HttpError(400, "Quantity must be greater than zero.");
    }
    const unitPrice = parseNumber(line.unit_price);
    if (unitPrice === null || unitPrice < 0) {
      throw new HttpError(400, "Price is not valid.");
    }
    if (lines.some((existing) => existing.productId === productId)) {
      throw new HttpError(400, "A product can appear only once in an order.");
    }
    lines.push({ productId, quantity, unitPrice });
  }
  if (!isValidDateTime(pickup_at)) {
    throw new HttpError(400, "Pickup date is not valid.");
  }
  return { pickupAt: pickup_at, acceptPartial: accept_partial ?? true, lines };
};

interface LockedProduct {
  id: number;
  store_id: number;
  name: string;
  unit: string;
  status: string;
  discounted_price: string;
  is_expired: boolean;
  store_visible: boolean;
  store_name: string | null;
}

// Prices are compared in whole cents, so 3.5 and "3.50" are the same price.
const cents = (value: number) => Math.round(value * 100);

// A line the server would not send as it is (409 ORDER_NOT_SENT lists them).
interface ProblemLine {
  product_id: number;
  kind: SendChangeKind;
  requested: number;
  available: number;
  unit_price: number;
}

export interface SentOrder {
  order: OrderRow;
  items: { id: number; product_id: number; quantity: string; unit_price: string }[];
  changes: SendChange[];
}

// Sends the order inside the caller's transaction. Lines with problems are handled by
// accept_partial: on, a line with less stock goes with what is left and a sold-out or more
// expensive line stays out; off, nothing is sent. Nothing sendable → 409 ORDER_NOT_SENT.
export const sendOrder = async (client: PoolClient, restaurantId: number, input: SendOrderInput): Promise<SentOrder> => {
  // Two parallel orders of one restaurant cannot both pass the limit.
  await client.query("SELECT pg_advisory_xact_lock($1, $2)", [PENDING_LOCK_NAMESPACE, restaurantId]);
  const pending = await client.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM orders WHERE orders.restaurant_id = $1 AND orders.status = 'Pending'",
    [restaurantId],
  );
  if (Number(pending.rows[0]!.count) >= MAX_PENDING_ORDERS) {
    throw new HttpError(409, PENDING_LIMIT_ERROR);
  }

  // Every product locked in ascending id, so orders sharing products cannot deadlock.
  const productIds = input.lines.map((line) => line.productId).sort((a, b) => a - b);
  const locked = await client.query<LockedProduct>(
    `SELECT products.id, products.store_id, products.name, products.unit, products.status,
            products.discounted_price, products.expiry_date < CURRENT_DATE AS is_expired,
            ${visibleStore("stores")} AS store_visible, stores.business_name AS store_name
     FROM products
     JOIN users AS stores ON stores.id = products.store_id
     WHERE products.id = ANY($1::int[])
     ORDER BY products.id
     FOR UPDATE OF products`,
    [productIds],
  );
  if (locked.rows.length !== productIds.length) {
    throw new HttpError(404, "Product not found.");
  }
  const storeIds = new Set(locked.rows.map((product) => product.store_id));
  if (storeIds.size > 1) {
    throw new HttpError(400, "An order can contain products of one store only.");
  }
  const storeId = locked.rows[0]!.store_id;
  const products = new Map(locked.rows.map((product) => [product.id, product]));

  const changes: SendChange[] = [];
  const problems: ProblemLine[] = [];
  const sendable: { line: SendLine; product: LockedProduct; quantity: number; price: number }[] = [];
  for (const line of input.lines) {
    const product = products.get(line.productId)!;
    const price = parseFloat(product.discounted_price);
    const sellable = product.status === "Available" && !product.is_expired && product.store_visible;
    const available = sellable ? await freeQuantity(client, product.id) : 0;
    const change = (kind: SendChangeKind, sent: number): SendChange => ({
      product_id: product.id,
      name: product.name,
      unit: product.unit,
      kind,
      requested: line.quantity,
      sent,
      old_price: line.unitPrice,
      new_price: price,
    });
    if (available <= 0) {
      problems.push({ product_id: product.id, kind: "NOT_SENT_SOLD_OUT", requested: line.quantity, available: 0, unit_price: price });
      changes.push(change("NOT_SENT_SOLD_OUT", 0));
      continue;
    }
    if (cents(price) > cents(line.unitPrice)) {
      problems.push({ product_id: product.id, kind: "NOT_SENT_PRICE_RAISED", requested: line.quantity, available, unit_price: price });
      changes.push(change("NOT_SENT_PRICE_RAISED", 0));
      continue;
    }
    const quantity = Math.min(line.quantity, available);
    if (quantity < line.quantity) {
      problems.push({ product_id: product.id, kind: "QUANTITY_REDUCED", requested: line.quantity, available, unit_price: price });
      changes.push(change("QUANTITY_REDUCED", quantity));
    }
    // A lower price is always applied.
    if (cents(price) < cents(line.unitPrice)) changes.push(change("PRICE_LOWERED", quantity));
    sendable.push({ line, product, quantity, price });
  }

  if (sendable.length === 0 || (!input.acceptPartial && problems.length > 0)) {
    throw new HttpError(409, "The order could not be sent.", { code: "ORDER_NOT_SENT", lines: problems });
  }

  // The pickup day must fit every sent line: today up to the earliest expiry among them.
  const range = await client.query<{ in_range: boolean }>(
    `SELECT $1::timestamp::date >= CURRENT_DATE
            AND $1::timestamp::date <= (SELECT MIN(products.expiry_date) FROM products WHERE products.id = ANY($2::int[]))
            AS in_range`,
    [input.pickupAt, sendable.map((entry) => entry.product.id)],
  );
  if (!range.rows[0]!.in_range) {
    throw new HttpError(400, "Pickup date must be between today and the products' expiry date.");
  }

  const order = await insertOrder(client, {
    storeId,
    restaurantId,
    pickupAt: input.pickupAt,
    acceptPartial: input.acceptPartial,
    sendChanges: changes,
  });
  const items: SentOrder["items"] = [];
  for (const entry of sendable) {
    // unit_price keeps the agreed price, even if the store edits the product later. pickup_date
    // repeats the order's pickup until the orders cleanup drops it from the items.
    const inserted = await client.query<SentOrder["items"][number]>(
      `INSERT INTO reservations
         (order_id, product_id, restaurant_id, quantity, ordered_quantity, unit_price, status, pickup_date)
       VALUES ($1, $2, $3, $4, $4, $5, 'Pending', $6)
       RETURNING reservations.id, reservations.product_id, reservations.quantity, reservations.unit_price`,
      [order.id, entry.product.id, restaurantId, entry.quantity, entry.price, input.pickupAt],
    );
    items.push(inserted.rows[0]!);
  }
  await recordOrderCreated(client, order.id, { source: "RESTAURANT", actorId: restaurantId });
  await createNotification(client, {
    userId: storeId,
    type: "ORDER_CREATED",
    message: `New order ${formatOrderCode(order.code)}: ${items.length} ${items.length === 1 ? "item" : "items"}.`,
    orderId: order.id,
  });
  return { order, items, changes };
};
