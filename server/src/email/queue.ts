import pool from "../config/db.js";
import { notBlocked } from "../utils/visibility.js";
import type { EmailConfig } from "./config.js";
import { applyRedirect } from "./redirect.js";
import { emailTemplate } from "./templates/index.js";
import type { EmailLanguage } from "./templates/layout.js";
import { NOTIFICATION_EMAIL_DATA, NOTIFICATION_EMAIL_FROM } from "./templates/notificationData.js";
import { InvalidEmailDataError, type Queryable } from "./templates/types.js";
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

// Queues one email per notification, called right after the notifications are inserted, with the
// same db (the caller's transaction, when there is one), so the emails are stored exactly when the
// notifications are. One INSERT ... SELECT for any number of notifications (an announcement reaches
// every store and restaurant): the template is the notification's type and the data is the
// snapshot of NOTIFICATION_EMAIL_DATA. Untyped notifications, blocked recipients (also a blocked
// company or a deactivated branch) and recipients who turned email notifications off get no email
// (notification emails are never system emails). Returns the number of emails queued.
export const enqueueNotificationEmails = async (db: Queryable, notificationIds: number[]): Promise<number> => {
  if (notificationIds.length === 0) return 0;
  const result = await db.query(
    `INSERT INTO email_queue (user_id, recipient, template, data, language)
     SELECT recipients.id, recipients.email, notifications.type, ${NOTIFICATION_EMAIL_DATA}, $2
     FROM ${NOTIFICATION_EMAIL_FROM}
     WHERE notifications.id = ANY($1::int[]) AND notifications.type IS NOT NULL
       AND ${notBlocked("recipients")} AND recipients.email_notifications
     ORDER BY notifications.id`,
    [notificationIds, DEFAULT_EMAIL_LANGUAGE],
  );
  return result.rowCount ?? 0;
};

// Queues one email that is not a notification's (e.g. the coming system emails: password reset,
// email confirmation, login details) to a user. A system template (`system: true`) ignores the
// user's email notifications switch; any other one follows it. Never for a blocked user. Returns
// whether the email was queued.
export const enqueueEmail = async (
  db: Queryable,
  { userId, template: name, data }: { userId: number; template: string; data: object },
): Promise<boolean> => {
  const template = emailTemplate(name);
  if (!template) throw new Error(`Unknown email template: ${name}`);
  const result = await db.query(
    `INSERT INTO email_queue (user_id, recipient, template, data, language)
     SELECT users.id, users.email, $2, $3, $4
     FROM users
     WHERE users.id = $1 AND ${notBlocked("users")} AND ($5 OR users.email_notifications)`,
    [userId, name, JSON.stringify(data), DEFAULT_EMAIL_LANGUAGE, template.system === true],
  );
  return (result.rowCount ?? 0) > 0;
};

// The ids of an INSERT INTO notifications ... RETURNING notifications.id.
export const insertedIds = (result: { rows: { id: number }[] }) => result.rows.map((row) => row.id);

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
  // The recipient now: null when the email has no user.
  email_notifications: boolean | null;
  recipient_active: boolean | null;
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
  skipped: number;
}

// One pass of the worker: claims the due emails, renders and sends each one, and records the
// outcome. An email whose recipient was blocked, or (unless it is a system email) turned email
// notifications off, since it was queued is SKIPPED instead of sent. A failed send waits for its next attempt (see RETRY_DELAYS_SECONDS) until
// MAX_EMAIL_ATTEMPTS, then the row is FAILED. Errors stay in the queue; they never reach the
// action that queued the email.
export const processEmailQueue = async ({
  transport,
  config,
  now = new Date(),
  batchSize = EMAIL_BATCH_SIZE,
  db = pool,
}: ProcessOptions): Promise<ProcessResult> => {
  const result: ProcessResult = { sent: 0, retrying: 0, failed: 0, skipped: 0 };

  // A worker that stopped mid-send left its rows SENDING: give them their next attempt.
  await db.query(
    `UPDATE email_queue
     SET status = CASE WHEN attempts >= $2 THEN 'FAILED' ELSE 'PENDING' END,
         next_attempt_at = $1, locked_at = NULL,
         last_error = COALESCE(last_error, 'The worker stopped while sending.')
     WHERE status = 'SENDING' AND locked_at < $1::timestamptz - make_interval(mins => $3)`,
    [now, MAX_EMAIL_ATTEMPTS, STALE_SENDING_MINUTES],
  );

  // SKIP LOCKED: several server instances never claim the same row. The due rows are picked in a
  // CTE, which runs exactly once; as an `IN (subquery)` the planner may run the subquery again and
  // claim more than LIMIT rows.
  const claimed = await db.query<ClaimedEmail>(
    `WITH due AS (
       SELECT email_queue.id FROM email_queue
       WHERE email_queue.status = 'PENDING' AND email_queue.next_attempt_at <= $1
       ORDER BY email_queue.next_attempt_at, email_queue.id
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     UPDATE email_queue
     SET status = 'SENDING', attempts = email_queue.attempts + 1, locked_at = $1
     FROM due
     WHERE email_queue.id = due.id
     RETURNING email_queue.id, email_queue.recipient, email_queue.template, email_queue.data,
               email_queue.language, email_queue.attempts,
               (SELECT users.email_notifications FROM users WHERE users.id = email_queue.user_id)
                 AS email_notifications,
               (SELECT ${notBlocked("users")} FROM users WHERE users.id = email_queue.user_id)
                 AS recipient_active`,
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

  const markSkipped = async (email: ClaimedEmail, reason: string) => {
    await db.query(`UPDATE email_queue SET status = 'SKIPPED', locked_at = NULL, last_error = $2 WHERE id = $1`, [
      email.id,
      reason,
    ]);
    result.skipped += 1;
  };

  for (const email of claimed.rows) {
    const template = emailTemplate(email.template);
    if (email.recipient_active === false) {
      await markSkipped(email, "The recipient is blocked.");
      continue;
    }
    if (template && !template.system && email.email_notifications === false) {
      await markSkipped(email, "The recipient turned email notifications off.");
      continue;
    }
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
