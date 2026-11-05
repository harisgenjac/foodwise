import { NOTIFICATION_TEMPLATES } from "./notificationEmails.js";
import { SYSTEM_TEMPLATES } from "./systemEmails.js";
import type { EmailTemplate } from "./types.js";

// Every email the queue can send, by the template name stored in email_queue.template. A
// notification's template is named after its type (notificationEmails.ts); the system emails
// (systemEmails.ts) have their own names.
export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = { ...NOTIFICATION_TEMPLATES, ...SYSTEM_TEMPLATES };

export const emailTemplate = (name: string): EmailTemplate | undefined =>
  Object.hasOwn(EMAIL_TEMPLATES, name) ? EMAIL_TEMPLATES[name] : undefined;
