import type { Pool, PoolClient } from "pg";
import { isValidDateTime } from "./dates.js";

// A store's order settings (users.delivery_enabled, preparation_minutes, orders_paused):
// delivery on or off, the default preparation time and the pause on new orders. Saved by the
// store on My profile, or by an admin in the profile
// dialog.

// The preparation times a store can choose, in minutes; 30 is the default.
const PREPARATION_MINUTES = [15, 30, 45, 60, 90, 120] as const;
// A timed pause ends at most this many days ahead; longer means "until I switch it back on".
export const MAX_PAUSE_DAYS = 30;

export const STORE_PAUSED_ERROR = "This store is not receiving orders right now.";

// Whether the store under `alias` takes no orders now: paused without an end, or until a time
// that has not passed yet (a passed one counts as off, nothing has to clear it). The alias is
// always a fixed name from code, never user input.
export const ordersPaused = (alias = "users") =>
  `(${alias}.orders_paused AND (${alias}.orders_paused_until IS NULL OR ${alias}.orders_paused_until > NOW()))`;

// The pause as the API shows it: orders_paused, and orders_paused_until only while the pause is on
// (null with it off or without an end).
export const pauseColumns = (alias = "users") =>
  `${ordersPaused(alias)} AS orders_paused,
   CASE WHEN ${ordersPaused(alias)} THEN ${alias}.orders_paused_until END AS orders_paused_until`;

// Every setting, for My profile and the admin's user row.
export const orderSettingsColumns = (alias = "users") =>
  `${alias}.delivery_enabled, ${alias}.preparation_minutes, ${pauseColumns(alias)}`;

interface OrderSettings {
  delivery_enabled: boolean;
  preparation_minutes: number;
  orders_paused: boolean;
  orders_paused_until: string | null;
}

export interface OrderSettingsInput {
  deliveryEnabled?: boolean;
  preparationMinutes?: number;
  // Paused, with an end time or without one (null); not paused clears the end.
  pause?: { paused: boolean; until: string | null };
}

// A date and time with its zone (Z or an offset), so the pause ends at the same instant whatever
// the server's own zone.
const hasZone = (value: string) => /(Z|[+-]\d{2}:?\d{2})$/.test(value);

// Validates the order settings in a body: { delivery_enabled?, preparation_minutes?,
// orders_paused?, orders_paused_until? }. Only the fields sent change; at least one is needed.
export const parseOrderSettings = (
  body: Record<string, unknown>,
  now: Date = new Date(),
): { input: OrderSettingsInput; error?: never } | { error: string; input?: never } => {
  const { delivery_enabled, preparation_minutes, orders_paused, orders_paused_until } = body;
  const input: OrderSettingsInput = {};
  if (delivery_enabled !== undefined) {
    if (typeof delivery_enabled !== "boolean") return { error: "Delivery must be turned on or off." };
    input.deliveryEnabled = delivery_enabled;
  }
  if (preparation_minutes !== undefined) {
    if (!PREPARATION_MINUTES.includes(preparation_minutes as (typeof PREPARATION_MINUTES)[number])) {
      return { error: "Preparation time is not valid." };
    }
    input.preparationMinutes = preparation_minutes as number;
  }
  if (orders_paused !== undefined) {
    if (typeof orders_paused !== "boolean") return { error: "The pause must be turned on or off." };
    let until: string | null = null;
    if (orders_paused && orders_paused_until !== undefined && orders_paused_until !== null) {
      const end = isValidDateTime(orders_paused_until) && hasZone(orders_paused_until)
        ? new Date(orders_paused_until)
        : null;
      const latest = now.getTime() + MAX_PAUSE_DAYS * 24 * 60 * 60 * 1000;
      if (!end || end.getTime() <= now.getTime() || end.getTime() > latest) {
        return { error: `The pause must end between now and ${MAX_PAUSE_DAYS} days from now.` };
      }
      until = end.toISOString();
    }
    input.pause = { paused: orders_paused, until };
  } else if (orders_paused_until !== undefined) {
    return { error: "The pause must be turned on or off." };
  }
  if (Object.keys(input).length === 0) return { error: "No settings to save." };
  return { input };
};

// Saves the settings sent (the others stay) and returns all of them.
export const saveOrderSettings = async (
  db: Pool | PoolClient,
  userId: number,
  input: OrderSettingsInput,
): Promise<OrderSettings> => {
  const result = await db.query<OrderSettings>(
    `UPDATE users SET
       delivery_enabled = COALESCE($2, delivery_enabled),
       preparation_minutes = COALESCE($3, preparation_minutes),
       orders_paused = CASE WHEN $4::boolean THEN $5::boolean ELSE orders_paused END,
       orders_paused_until = CASE WHEN $4::boolean THEN $6::timestamptz ELSE orders_paused_until END
     WHERE users.id = $1
     RETURNING ${orderSettingsColumns("users")}`,
    [
      userId,
      input.deliveryEnabled ?? null,
      input.preparationMinutes ?? null,
      input.pause !== undefined,
      input.pause?.paused ?? false,
      input.pause?.until ?? null,
    ],
  );
  return result.rows[0]!;
};
