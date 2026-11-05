import type { NotificationType } from "../../utils/notifications.js";
import { reservationCreated } from "./reservationCreated.js";
import type { EmailTemplate } from "./types.js";

// Which notifications also go out by email. A notification type with a template here gets an
// email from createNotification; adding an email for another type means adding its template.
// The template name stored in email_queue is the notification type.
export const EMAIL_TEMPLATES: Partial<Record<NotificationType, EmailTemplate>> = {
  RESERVATION_CREATED: reservationCreated,
};

export const emailTemplate = (name: string): EmailTemplate | undefined =>
  Object.hasOwn(EMAIL_TEMPLATES, name) ? EMAIL_TEMPLATES[name as NotificationType] : undefined;
