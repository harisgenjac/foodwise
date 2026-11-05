import type { Pool, PoolClient } from "pg";
import type { NotificationType } from "../../utils/notifications.js";
import type { EmailLanguage, RenderedEmail } from "./layout.js";

export type Queryable = Pool | PoolClient;

// The notification an email belongs to, as createNotification received it (links filled in).
export interface NotificationEvent {
  userId: number;
  type: NotificationType;
  reservationId: number | null;
  productId: number | null;
  donationId: number | null;
  creditRequestId: number | null;
  branchId: number | null;
  details: string | null;
}

export interface EmailTemplate {
  // Runs in the notification's transaction and returns the snapshot stored in email_queue.data,
  // or null when there is nothing to send (the linked row is gone).
  load(db: Queryable, event: NotificationEvent): Promise<object | null>;
  // Pure: the stored snapshot in the recipient's language. appUrl is the frontend origin.
  render(data: unknown, lang: EmailLanguage, appUrl: string): RenderedEmail;
}

// The stored data does not fit the template; retrying would not help.
export class InvalidEmailDataError extends Error {
  constructor(template: string) {
    super(`The stored data does not match the ${template} email template.`);
  }
}
