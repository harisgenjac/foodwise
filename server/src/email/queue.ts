import pool from "../config/db.js";
import { notBlocked } from "../utils/visibility.js";
import type { EmailConfig } from "./config.js";
import { applyRedirect } from "./redirect.js";
import { emailTemplate, EMAIL_TEMPLATES } from "./templates/index.js";
import type { EmailLanguage } from "./templates/layout.js";
import { InvalidEmailDataError, type NotificationEvent, type Queryable } from "./templates/types.js";
import { createEmailTransport, type EmailTransport } from "./transports.js";

// The users' language is not stored yet (the switcher only changes the open page), so every
// email goes out in Bosnian for now. The queue keeps a language per email for when it is.
export const DEFAULT_EMAIL_LANGUAGE: EmailLanguage = "bs";

export const MAX_EMAIL_ATTEMPTS = 5;
// Wait after a failed attempt 1, 2, 3, 4 before the next one (1 min, 5 min, 30 min, 2 h).
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200] as const;
// A row still SENDING after this long belongs to a worker that stopped mid-send.
export const STALE_SENDING_MINUTES = 10;
export const EMAIL_BATCH_SIZE = 50;
export const EMAIL_POLL_INTERVAL_MS = 5_000;
const MAX_ERROR_LENGTH = 1000;

// Called by createNotification in the notification's own transaction, so the email is queued
// exactly when the notification is stored. Returns whether an email was queued: only types with
// a template, and never for a blocked user (also a blocked company or a deactivated branch).
export const enqueueNotificationEmail = async (db: Queryable, event: NotificationEvent): Promise<boolean> => {
  const template = EMAIL_TEMPLATES[event.type];
  if (!template) return false;
  const data = await template.load(db, event);
  if (data === null) return false;
  const result = await db.query(
    `INSERT INTO email_queue (user_id, recipient, template, data, language)
     SELECT users.id, users.email, $2, $3, $4
     FROM users
     WHERE users.id = $1 AND ${notBlocked("users")}`,
    [event.userId, event.type, JSON.stringify(data), DEFAULT_EMAIL_LANGUAGE],
  );
  return (result.rowCount ?? 0) > 0;
};

export const retryDelaySeconds = (attempts: number) =>
  RETRY_DELAYS_SECONDS[Math.min(attempts, RETRY_DELAYS_SECONDS.length) - 1] ?? RETRY_DELAYS_SECONDS[0];

const errorText = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);

interface ClaimedEmail {
  id: number;
  recipient: string;
  template: string;
  data: unknown;
  language: string;
  attempts: number;
}

export interface ProcessOptions {
  transport: EmailTransport;
  config: Pick<EmailConfig, "from" | "redirectTo" | "appUrl">;
  now?: Date;
  batchSize?: number;
  db?: Queryable;
}

export interface ProcessResult {
  sent: number;
  retrying: number;
  failed: number;
}

// One pass of the worker: claims the due emails, renders and sends each one, and records the
// outcome. A failed send waits for its next attempt (see RETRY_DELAYS_SECONDS) until
// MAX_EMAIL_ATTEMPTS, then the row is FAILED. Errors stay in the queue; they never reach the
// action that queued the email.
export const processEmailQueue = async ({
  transport,
  config,
  now = new Date(),
  batchSize = EMAIL_BATCH_SIZE,
  db = pool,
}: ProcessOptions): Promise<ProcessResult> => {
  const result: ProcessResult = { sent: 0, retrying: 0, failed: 0 };

  // A worker that stopped mid-send left its rows SENDING: give them their next attempt.
  await db.query(
    `UPDATE email_queue
     SET status = CASE WHEN attempts >= $2 THEN 'FAILED' ELSE 'PENDING' END,
         next_attempt_at = $1, locked_at = NULL,
         last_error = COALESCE(last_error, 'The worker stopped while sending.')
     WHERE status = 'SENDING' AND locked_at < $1::timestamptz - make_interval(mins => $3)`,
    [now, MAX_EMAIL_ATTEMPTS, STALE_SENDING_MINUTES],
  );

  // SKIP LOCKED: several server instances never claim the same row.
  const claimed = await db.query<ClaimedEmail>(
    `UPDATE email_queue
     SET status = 'SENDING', attempts = email_queue.attempts + 1, locked_at = $1
     WHERE email_queue.id IN (
       SELECT email_queue.id FROM email_queue
       WHERE email_queue.status = 'PENDING' AND email_queue.next_attempt_at <= $1
       ORDER BY email_queue.next_attempt_at, email_queue.id
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING email_queue.id, email_queue.recipient, email_queue.template, email_queue.data,
               email_queue.language, email_queue.attempts`,
    [now, batchSize],
  );

  const markFailed = async (email: ClaimedEmail, error: unknown) => {
    await db.query(
      `UPDATE email_queue SET status = 'FAILED', locked_at = NULL, last_error = $2 WHERE id = $1`,
      [email.id, errorText(error)],
    );
    result.failed += 1;
    console.error(
      `Email ${email.id} (${email.template}) failed for good after ${email.attempts} attempt(s): ${errorText(error)}`,
    );
  };

  for (const email of claimed.rows) {
    const template = emailTemplate(email.template);
    let rendered;
    try {
      if (!template) throw new InvalidEmailDataError(email.template);
      const language: EmailLanguage = email.language === "en" ? "en" : "bs";
      rendered = template.render(email.data, language, config.appUrl);
    } catch (error) {
      // Unknown template or data that does not fit it: retrying would not help.
      await markFailed(email, error);
      continue;
    }

    const message = applyRedirect({ from: config.from, to: email.recipient, ...rendered }, config.redirectTo);
    try {
      await transport.send(message, { idempotencyKey: `foodwise-email-${email.id}` });
      await db.query(
        `UPDATE email_queue SET status = 'SENT', sent_at = $2, locked_at = NULL, last_error = NULL WHERE id = $1`,
        [email.id, now],
      );
      result.sent += 1;
    } catch (error) {
      if (email.attempts >= MAX_EMAIL_ATTEMPTS) {
        await markFailed(email, error);
        continue;
      }
      await db.query(
        `UPDATE email_queue
         SET status = 'PENDING', locked_at = NULL, last_error = $2,
             next_attempt_at = $3::timestamptz + make_interval(secs => $4)
         WHERE id = $1`,
        [email.id, errorText(error), now, retryDelaySeconds(email.attempts)],
      );
      result.retrying += 1;
      console.error(
        `Email ${email.id} (${email.template}) failed on attempt ${email.attempts} of ${MAX_EMAIL_ATTEMPTS}, retrying later: ${errorText(error)}`,
      );
    }
  }
  return result;
};

// Started from server.ts only (tests call processEmailQueue directly). Runs a pass at once and then
// every EMAIL_POLL_INTERVAL_MS; a pass still running is never started twice.
export const startEmailWorker = (config: EmailConfig, transport: EmailTransport = createEmailTransport(config)) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processEmailQueue({ transport, config });
    } catch (error) {
      console.error("Error while processing the email queue:", error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), EMAIL_POLL_INTERVAL_MS);
  return { stop: () => clearInterval(timer), tick };
};
