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
  | "PICKUP_MISSED"
  | "PRODUCT_REMOVED_BY_ADMIN"
  | "DONATION_REMOVED_BY_ADMIN"
  | "RESERVATION_CANCELLED_BY_ADMIN";

interface NewNotification {
  userId: number;
  type: NotificationType;
  message: string;
  reservationId?: number | null;
  productId?: number | null;
  donationId?: number | null;
  // Free text the client shows next to the translated notification (an admin's reason).
  details?: string | null;
}

// Accepts the pool or a transaction client, so the insert can join the caller's transaction.
export const createNotification = async (
  db: Pool | PoolClient,
  {
    userId,
    type,
    message,
    reservationId = null,
    productId = null,
    donationId = null,
    details = null,
  }: NewNotification,
) => {
  await db.query(
    `INSERT INTO notifications (user_id, type, message, reservation_id, product_id, donation_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, type, message, reservationId, productId, donationId, details],
  );
};
