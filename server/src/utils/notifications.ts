import type { Pool, PoolClient } from "pg";

// The client translates notifications by `type`; `message` is the English fallback.
export type NotificationType =
  | "RESERVATION_CREATED"
  | "RESERVATION_ACCEPTED"
  | "RESERVATION_REJECTED"
  | "RESERVATION_CANCELLED"
  | "RESERVATION_EXPIRED"
  | "PRODUCT_EXPIRED"
  | "PRODUCT_SOLD_OUT"
  | "PRODUCT_EXPIRING_SOON"
  | "PICKUP_TODAY"
  | "RESERVATION_COMPLETED"
  | "PICKUP_MISSED";

interface NewNotification {
  userId: number;
  type: NotificationType;
  message: string;
  reservationId?: number | null;
  productId?: number | null;
}

// Accepts the pool or a transaction client, so the insert can join the caller's transaction.
export const createNotification = async (
  db: Pool | PoolClient,
  { userId, type, message, reservationId = null, productId = null }: NewNotification,
) => {
  await db.query(
    `INSERT INTO notifications (user_id, type, message, reservation_id, product_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, message, reservationId, productId],
  );
};
