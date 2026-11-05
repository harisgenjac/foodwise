/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Invitations instead of a temporary password:
// - auth_tokens gets the INVITATION purpose (a link to set the first password, 72 hours).
// - account_events gets INVITATION_ACCEPTED.
// - users.last_login_at: the last successful login; null = never logged in, which is when an
//   admin can resend the invitation. Existing accounts that already replaced the admin's
//   temporary password have logged in, so they get their creation time; the others stay null.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumn("users", { last_login_at: { type: "timestamptz" } });
  pgm.sql(`UPDATE users SET last_login_at = created_at WHERE must_change_password = false`);

  pgm.dropConstraint("auth_tokens", "auth_tokens_purpose_check");
  pgm.addConstraint("auth_tokens", "auth_tokens_purpose_check", {
    check: "purpose IN ('PASSWORD_RESET', 'INVITATION')",
  });
  pgm.dropConstraint("account_events", "account_events_event_check");
  pgm.addConstraint("account_events", "account_events_event_check", {
    check: "event IN ('PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET', 'INVITATION_ACCEPTED')",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`DELETE FROM account_events WHERE event = 'INVITATION_ACCEPTED'`);
  pgm.dropConstraint("account_events", "account_events_event_check");
  pgm.addConstraint("account_events", "account_events_event_check", {
    check: "event IN ('PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET')",
  });
  pgm.sql(`DELETE FROM auth_tokens WHERE purpose = 'INVITATION'`);
  pgm.dropConstraint("auth_tokens", "auth_tokens_purpose_check");
  pgm.addConstraint("auth_tokens", "auth_tokens_purpose_check", { check: "purpose IN ('PASSWORD_RESET')" });
  pgm.dropColumn("users", "last_login_at");
};
