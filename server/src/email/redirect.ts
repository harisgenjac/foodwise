import type { EmailMessage } from "./transports.js";

// EMAIL_REDIRECT_TO: every email goes to one test inbox instead of its real recipient, and the
// subject names who it was for, e.g. "[to: store@example.com] Nova rezervacija: ...".
export const applyRedirect = (message: EmailMessage, redirectTo: string | null): EmailMessage =>
  redirectTo === null
    ? message
    : { ...message, to: redirectTo, subject: `[to: ${message.to}] ${message.subject}` };
