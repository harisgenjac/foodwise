/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Platform announcements: an admin writes to all stores, all restaurants or everyone. Each
// recipient gets a notification, and the announcement shows as a banner until it expires, the
// admin ends it, or the user dismisses it.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createType("announcement_audience", ["ALL", "STORE", "RESTAURANT"]);

  pgm.createTable("announcements", {
    id: "id",
    admin_id: { type: "integer", notNull: true, references: "users", onDelete: "RESTRICT" },
    audience: { type: "announcement_audience", notNull: true },
    title_bs: { type: "varchar(120)", notNull: true },
    body_bs: { type: "text", notNull: true },
    title_en: { type: "varchar(120)" },
    body_en: { type: "text" },
    expires_at: { type: "timestamptz" },
    ended_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.createIndex("announcements", "created_at");

  pgm.createTable("announcement_dismissals", {
    announcement_id: {
      type: "integer",
      notNull: true,
      references: "announcements",
      onDelete: "CASCADE",
      primaryKey: true,
    },
    user_id: { type: "integer", notNull: true, references: "users", onDelete: "CASCADE", primaryKey: true },
    dismissed_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addColumn("notifications", {
    announcement_id: { type: "integer", references: "announcements", onDelete: "SET NULL" },
  });
  pgm.addColumn("admin_actions", {
    target_announcement_id: { type: "integer", references: "announcements", onDelete: "SET NULL" },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumn("admin_actions", "target_announcement_id");
  pgm.dropColumn("notifications", "announcement_id");
  pgm.dropTable("announcement_dismissals");
  pgm.dropTable("announcements");
  pgm.dropType("announcement_audience");
};
