/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// The "Email notifications" switch on My profile: on by default, also for every existing user.
// While it is off no notification emails are queued, and one already queued is SKIPPED when it
// comes to be sent (system emails ignore it). SKIPPED is also used for a recipient blocked since
// the email was queued.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumn("users", {
    email_notifications: { type: "boolean", notNull: true, default: true },
  });
  pgm.dropConstraint("email_queue", "email_queue_status_check");
  pgm.addConstraint("email_queue", "email_queue_status_check", {
    check: "status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql("DELETE FROM email_queue WHERE status = 'SKIPPED'");
  pgm.dropConstraint("email_queue", "email_queue_status_check");
  pgm.addConstraint("email_queue", "email_queue_status_check", {
    check: "status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')",
  });
  pgm.dropColumn("users", "email_notifications");
};
