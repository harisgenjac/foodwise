/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Admin module: blocked accounts, the audit log of admin actions, and notifications that
// carry the admin's reason and a link to a donation offer.
// An admin creates store and restaurant accounts with only an email and a password, so the
// names become optional; the user fills them in on the profile page.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.alterColumn("users", "first_name", { notNull: false });
  pgm.alterColumn("users", "last_name", { notNull: false });
  pgm.addColumns("users", {
    is_blocked: { type: "boolean", notNull: true, default: false },
    blocked_at: { type: "timestamp" },
    blocked_reason: { type: "text" },
  });

  pgm.createType("admin_action_type", [
    "CREATE_USER",
    "RESET_PASSWORD",
    "BLOCK_USER",
    "UNBLOCK_USER",
    "REMOVE_PRODUCT",
    "REMOVE_DONATION",
  ]);

  pgm.createTable("admin_actions", {
    id: "id",
    // RESTRICT keeps the audit trail: an admin who acted cannot be deleted.
    admin_id: { type: "integer", notNull: true, references: "users", onDelete: "RESTRICT" },
    action: { type: "admin_action_type", notNull: true },
    target_user_id: { type: "integer", references: "users", onDelete: "SET NULL" },
    target_product_id: { type: "integer", references: "products", onDelete: "SET NULL" },
    target_donation_id: { type: "integer", references: "donation_offers", onDelete: "SET NULL" },
    reason: { type: "text" },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.createIndex("admin_actions", "created_at");
  pgm.createIndex("admin_actions", "admin_id");
  pgm.createIndex("admin_actions", "target_user_id");

  pgm.addColumns("notifications", {
    donation_id: { type: "integer", references: "donation_offers", onDelete: "SET NULL" },
    details: { type: "text" },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumns("notifications", ["donation_id", "details"]);
  pgm.dropTable("admin_actions");
  pgm.dropType("admin_action_type");
  pgm.dropColumns("users", ["is_blocked", "blocked_at", "blocked_reason"]);
  pgm.sql(`UPDATE users SET first_name = '' WHERE first_name IS NULL`);
  pgm.sql(`UPDATE users SET last_name = '' WHERE last_name IS NULL`);
  pgm.alterColumn("users", "first_name", { notNull: true });
  pgm.alterColumn("users", "last_name", { notNull: true });
};
