import pool from "../config/db.js";
import { getDeliveryProvider } from "../delivery/config.js";
import type { DeliveryProvider } from "../delivery/types.js";
import { HttpError } from "../utils/httpError.js";
import { inTransaction } from "../utils/transaction.js";
import { lockOrder } from "./orders/status.js";

// Courier ratings (docs/product.md): the restaurant of a delivered delivery order rates its courier
// once, within COURIER_RATING_DAYS of the delivery. The rating is stored first and then passed on to
// the delivery provider (rateCourier); when the provider call fails the rating stays and the retry
// job (jobs/courierRatings.ts) sends it again (sent_at, attempts, last_error).

export const COURIER_RATING_DAYS = 7;
const MAX_COMMENT = 500;
// After this many failed calls a rating is no longer retried (the admin still sees it).
export const MAX_RATING_ATTEMPTS = 10;

interface RatingRow {
  id: number;
  order_id: number;
  rating: number;
  comment: string | null;
  courier_id: string | null;
  courier_name: string | null;
  created_at: string;
  sent_at: string | null;
}

const RATING_COLUMNS = `courier_ratings.id, courier_ratings.order_id, courier_ratings.rating, courier_ratings.comment,
  courier_ratings.courier_id, courier_ratings.courier_name, courier_ratings.created_at, courier_ratings.sent_at`;

const parseRating = (body: Record<string, unknown>) => {
  const { rating } = body;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, "The rating must be a whole number from 1 to 5.");
  }
  let comment: string | null = null;
  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== "string" || body.comment.trim().length > MAX_COMMENT) {
      throw new HttpError(400, `The comment can be at most ${MAX_COMMENT} characters long.`);
    }
    comment = body.comment.trim() || null;
  }
  return { rating, comment };
};

// Passes one stored rating on to the provider; records the outcome. Never throws.
export const sendCourierRating = async (ratingId: number, provider: DeliveryProvider = getDeliveryProvider()) => {
  const row = (
    await pool.query<{ rating: number; comment: string | null; provider: string; provider_delivery_id: string | null }>(
      `SELECT courier_ratings.rating, courier_ratings.comment, courier_ratings.provider, deliveries.provider_delivery_id
       FROM courier_ratings JOIN deliveries ON deliveries.id = courier_ratings.delivery_id
       WHERE courier_ratings.id = $1 AND courier_ratings.sent_at IS NULL`,
      [ratingId],
    )
  ).rows[0];
  if (!row) return false;
  try {
    if (row.provider !== provider.name || row.provider_delivery_id === null) {
      throw new Error(`The delivery belongs to provider ${row.provider}, not ${provider.name}.`);
    }
    await provider.rateCourier(row.provider_delivery_id, { rating: row.rating, comment: row.comment });
    await pool.query(
      `UPDATE courier_ratings SET sent_at = NOW(), attempts = courier_ratings.attempts + 1, last_error = NULL
       WHERE courier_ratings.id = $1`,
      [ratingId],
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Sending courier rating ${ratingId} to the delivery provider failed:`, message);
    await pool.query(
      "UPDATE courier_ratings SET attempts = courier_ratings.attempts + 1, last_error = $2 WHERE courier_ratings.id = $1",
      [ratingId, message.slice(0, 1000)],
    );
    return false;
  }
};

// POST /orders/:id/courier-rating. Stores the rating (one per order), then sends it to the provider
// outside the transaction, so a slow or failing provider never loses the restaurant's rating.
export const rateOrderCourier = async (
  restaurantId: number,
  orderId: number,
  body: Record<string, unknown>,
  provider: DeliveryProvider = getDeliveryProvider(),
): Promise<RatingRow> => {
  const stored = await inTransaction(async (client) => {
    const order = await lockOrder(client, orderId);
    if (!order || order.restaurant_id !== restaurantId) throw new HttpError(404, "Order not found.");
    const input = parseRating(body);
    const delivery = (
      await client.query<{ id: number; provider: string; status: string; courier_id: string | null; courier_name: string | null; recent: boolean }>(
        `SELECT deliveries.id, deliveries.provider, deliveries.status, deliveries.courier_id, deliveries.courier_name,
                deliveries.delivered_at > NOW() - INTERVAL '${COURIER_RATING_DAYS} days' AS recent
         FROM deliveries WHERE deliveries.order_id = $1`,
        [order.id],
      )
    ).rows[0];
    if (order.fulfilment_method !== "DELIVERY" || !delivery || delivery.status !== "DELIVERED") {
      throw new HttpError(400, "Only the courier of a delivered order can be rated.");
    }
    if (!delivery.recent) {
      throw new HttpError(400, `The courier can be rated within ${COURIER_RATING_DAYS} days of the delivery.`);
    }
    const inserted = await client.query<RatingRow>(
      `INSERT INTO courier_ratings (order_id, delivery_id, restaurant_id, provider, courier_id, courier_name, rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (order_id) DO NOTHING
       RETURNING ${RATING_COLUMNS}`,
      [order.id, delivery.id, restaurantId, delivery.provider, delivery.courier_id, delivery.courier_name, input.rating, input.comment],
    );
    if (inserted.rowCount === 0) throw new HttpError(409, "The courier of this order has already been rated.");
    return inserted.rows[0]!;
  });
  const sent = await sendCourierRating(stored.id, provider);
  if (!sent) return stored;
  return (await pool.query<RatingRow>(`SELECT ${RATING_COLUMNS} FROM courier_ratings WHERE courier_ratings.id = $1`, [stored.id]))
    .rows[0]!;
};

// The retry job: every rating the provider has not received yet (and has not refused too often),
// oldest first. Returns how many were sent.
export const retryCourierRatings = async (provider: DeliveryProvider = getDeliveryProvider()) => {
  const due = await pool.query<{ id: number }>(
    `SELECT courier_ratings.id FROM courier_ratings
     WHERE courier_ratings.sent_at IS NULL AND courier_ratings.attempts < $1
       -- A new rating is being sent by its own request right now.
       AND courier_ratings.created_at < NOW() - INTERVAL '1 minute'
     ORDER BY courier_ratings.created_at, courier_ratings.id`,
    [MAX_RATING_ATTEMPTS],
  );
  let sent = 0;
  for (const { id } of due.rows) {
    if (await sendCourierRating(id, provider)) sent++;
  }
  return sent;
};
