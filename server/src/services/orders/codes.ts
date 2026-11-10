import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";

// The short order code (docs/orders-design.md, section 9): 4 random characters without the easily
// confused 0, O, 1 and I, shown as #K7PM. Random, so it does not reveal how many orders a store
// gets; unique within a store (UNIQUE (store_id, code)), so it is always shown with the store or
// restaurant name and URLs use the order id.
export const ORDER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ORDER_CODE_LENGTH = 4;
const MAX_CODE_TRIES = 10;

export const generateOrderCode = () =>
  Array.from({ length: ORDER_CODE_LENGTH }, () => ORDER_CODE_ALPHABET[randomInt(ORDER_CODE_ALPHABET.length)]).join("");

export const formatOrderCode = (code: string) => `#${code}`;

// A code as typed in a search (with or without #, any case, spaces around) in its stored form;
// null when it cannot be a code (search filters answer 400 then).
export const parseOrderCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const code = value.trim().replace(/^#/, "").toUpperCase();
  return code.length > 0 && code.length <= ORDER_CODE_LENGTH && /^[A-Z0-9]+$/.test(code) ? code : null;
};

export interface NewOrder {
  storeId: number;
  restaurantId: number;
  pickupAt: string;
  acceptPartial: boolean;
  sendChanges: unknown[];
}

export interface OrderRow {
  id: number;
  store_id: number;
  restaurant_id: number;
  code: string;
  status: string;
  fulfilment_method: string;
  pickup_at: string;
  accept_partial: boolean;
  decided_at: string | null;
  send_changes: unknown[];
  picked_up_at: string | null;
  created_at: string;
  updated_at: string;
}

// Inserts a Pending pickup order with a fresh code. A collision draws again; ten collisions in a
// row are practically impossible (32^4 codes per store), so they end in an error.
export const insertOrder = async (client: PoolClient, order: NewOrder): Promise<OrderRow> => {
  for (let attempt = 0; attempt < MAX_CODE_TRIES; attempt++) {
    const result = await client.query<OrderRow>(
      `INSERT INTO orders (store_id, restaurant_id, code, pickup_at, accept_partial, send_changes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (store_id, code) DO NOTHING
       RETURNING *`,
      [
        order.storeId,
        order.restaurantId,
        generateOrderCode(),
        order.pickupAt,
        order.acceptPartial,
        JSON.stringify(order.sendChanges),
      ],
    );
    if (result.rows[0]) return result.rows[0];
  }
  throw new Error(`No free order code for store ${order.storeId} after ${MAX_CODE_TRIES} tries.`);
};
