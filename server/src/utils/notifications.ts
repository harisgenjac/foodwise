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
  // To the restaurant when a branch is deactivated (by its headquarters or an admin).
  | "RESERVATION_CANCELLED_STORE_CLOSED"
  // To a company's headquarters when an admin acts on one of its branches, linked by branch_id.
  | "BRANCH_BLOCKED"
  | "BRANCH_UNBLOCKED"
  | "BRANCH_DEACTIVATED"
  | "BRANCH_REACTIVATED"
  // Inserted in bulk by createAnnouncement (admin.controller.ts), linked by announcement_id.
  | "PLATFORM_ANNOUNCEMENT"
  // Credits, linked by credit_request_id. CREATED goes to every admin (notifyAdminsOfCreditRequest).
  | "CREDIT_REQUEST_CREATED"
  | "CREDIT_REQUEST_APPROVED"
  | "CREDIT_REQUEST_REJECTED"
  // To the user, from the renewal job (jobs/creditRenewals.ts). SKIPPED has no request: none was
  // created because the plan is no longer offered.
  | "CREDIT_RENEWAL_CREATED"
  | "CREDIT_REQUEST_EXPIRED"
  | "CREDIT_RENEWAL_SKIPPED";

interface NewNotification {
  userId: number;
  type: NotificationType;
  message: string;
  reservationId?: number | null;
  productId?: number | null;
  donationId?: number | null;
  creditRequestId?: number | null;
  branchId?: number | null;
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
    branchId = null,
    details = null,
  }: NewNotification,
) => {
  await db.query(
    `INSERT INTO notifications
       (user_id, type, message, reservation_id, product_id, donation_id, credit_request_id, branch_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, type, message, reservationId, productId, donationId, creditRequestId, branchId, details],
  );
};

// An admin acted on a branch: every headquarters login of its company is told (the only
// notifications a headquarters gets besides announcements). Nothing for a store without a company.
export const notifyCompanyHq = async (
  db: Pool | PoolClient,
  branch: { id: number; company_id: number | null; business_name: string | null },
  type: "BRANCH_BLOCKED" | "BRANCH_UNBLOCKED" | "BRANCH_DEACTIVATED" | "BRANCH_REACTIVATED",
  details: string | null = null,
) => {
  if (branch.company_id === null) return;
  const verbs = {
    BRANCH_BLOCKED: "blocked",
    BRANCH_UNBLOCKED: "unblocked",
    BRANCH_DEACTIVATED: "deactivated",
    BRANCH_REACTIVATED: "reactivated",
  };
  await db.query(
    `INSERT INTO notifications (user_id, type, message, branch_id, details)
     SELECT users.id, $1, $2, $3, $4
     FROM users
     WHERE users.role = 'COMPANY' AND users.company_id = $5 AND users.is_blocked = false`,
    [
      type,
      `Branch ${verbs[type]} by the platform administrator: ${branch.business_name ?? ""}`,
      branch.id,
      details,
      branch.company_id,
    ],
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
