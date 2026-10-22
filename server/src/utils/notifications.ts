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
  | "RESERVATION_CANCELLED_BY_ADMIN"
  // Inserted in bulk by createAnnouncement (admin.controller.ts), linked by announcement_id.
  | "PLATFORM_ANNOUNCEMENT"
  // Credits, linked by credit_request_id. CREATED goes to every admin (notifyAdminsOfCreditRequest).
  | "CREDIT_REQUEST_CREATED"
  | "CREDIT_REQUEST_APPROVED"
  | "CREDIT_REQUEST_REJECTED";

interface NewNotification {
  userId: number;
  type: NotificationType;
  message: string;
  reservationId?: number | null;
  productId?: number | null;
  donationId?: number | null;
  creditRequestId?: number | null;
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
    creditRequestId = null,
    details = null,
  }: NewNotification,
) => {
  await db.query(
    `INSERT INTO notifications (user_id, type, message, reservation_id, product_id, donation_id, credit_request_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, type, message, reservationId, productId, donationId, creditRequestId, details],
  );
};

// A new pending credit request needs an admin's decision, so every active admin is told.
export const notifyAdminsOfCreditRequest = async (db: Pool | PoolClient, requestId: number, message: string) => {
  await db.query(
    `INSERT INTO notifications (user_id, type, message, credit_request_id)
     SELECT users.id, 'CREDIT_REQUEST_CREATED', $2, $1
     FROM users
     WHERE users.role = 'ADMIN' AND users.is_blocked = false`,
    [requestId, message],
  );
};
