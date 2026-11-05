/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// The email sending queue. A row is written in the same transaction as the in-app notification
// it belongs to (utils/notifications.ts), and the background worker (email/queue.ts) sends it
// later with retries, so an email service error never breaks the action that caused it.
// `data` is a snapshot of what the template needs, taken when the row is written.
// status: PENDING (waiting, also between retries), SENDING (claimed by a worker), SENT,
// FAILED (gave up after the maximum attempts, or the template is unknown).
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("email_queue", {
    id: "id",
    // Deleting a user drops their unsent and sent emails, like their notifications.
    user_id: { type: "integer", references: "users", onDelete: "CASCADE" },
    recipient: { type: "varchar(254)", notNull: true },
    template: { type: "varchar(64)", notNull: true },
    data: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    language: { type: "varchar(2)", notNull: true, default: "bs" },
    status: { type: "varchar(16)", notNull: true, default: "PENDING" },
    attempts: { type: "integer", notNull: true, default: 0 },
    next_attempt_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    locked_at: { type: "timestamptz" },
    last_error: { type: "text" },
    sent_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("email_queue", "email_queue_status_check", {
    check: "status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')",
  });
  pgm.addConstraint("email_queue", "email_queue_language_check", {
    check: "language IN ('bs', 'en')",
  });
  pgm.addConstraint("email_queue", "email_queue_attempts_check", { check: "attempts >= 0" });
  // What the worker reads every few seconds: the due rows waiting to be sent.
  pgm.createIndex("email_queue", "next_attempt_at", {
    name: "email_queue_due",
    where: "status = 'PENDING'",
  });
  pgm.createIndex("email_queue", "user_id");
  pgm.createTrigger("email_queue", "set_email_queue_updated_at", {
    when: "BEFORE",
    operation: "UPDATE",
    function: "set_updated_at",
    level: "ROW",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable("email_queue");
};
