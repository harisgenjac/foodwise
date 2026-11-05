/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Forgot password:
// - auth_tokens: one-time links sent by email. Only the SHA-256 hash of the random token is
//   stored; a link is valid until expires_at, can be used once (used_at), and a newer token for
//   the same user revokes the older open ones (revoked_at).
// - account_events: what a user did to their own account without an admin (admin_actions keeps
//   only admin actions), e.g. asking for a reset link and resetting the password.
// - users.session_version: in every login token; raising it signs out every session of the user.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumn("users", {
    session_version: { type: "integer", notNull: true, default: 0 },
  });

  pgm.createTable("auth_tokens", {
    id: "id",
    user_id: { type: "integer", notNull: true, references: "users", onDelete: "CASCADE" },
    purpose: { type: "varchar(32)", notNull: true },
    token_hash: { type: "char(64)", notNull: true, unique: true },
    expires_at: { type: "timestamptz", notNull: true },
    used_at: { type: "timestamptz" },
    revoked_at: { type: "timestamptz" },
    // The admin who sent it; null when the user asked for it.
    created_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("auth_tokens", "auth_tokens_purpose_check", { check: "purpose IN ('PASSWORD_RESET')" });
  pgm.createIndex("auth_tokens", ["user_id", "created_at"]);
  pgm.createIndex("auth_tokens", "created_by");

  pgm.createTable("account_events", {
    id: "id",
    user_id: { type: "integer", notNull: true, references: "users", onDelete: "CASCADE" },
    event: { type: "varchar(40)", notNull: true },
    // The caller's address, for a request without a session.
    ip: { type: "varchar(64)" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("account_events", "account_events_event_check", {
    check: "event IN ('PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET')",
  });
  pgm.createIndex("account_events", ["user_id", "created_at"]);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable("account_events");
  pgm.dropTable("auth_tokens");
  pgm.dropColumn("users", "session_version");
};
