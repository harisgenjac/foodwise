/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// A store's order settings (delivery phase 2), saved on My profile or by an admin:
// - delivery_enabled: the store also offers delivery (the cart offers it only then);
// - preparation_minutes: the default time to get an order ready, suggested when accepting one;
// - orders_paused / orders_paused_until: the store takes no new orders, until a time or until it
//   switches the pause off. A pause whose time has passed counts as off (utils/orderSettings.ts).
// Restaurants get the defaults and never use them.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns("users", {
    delivery_enabled: { type: "boolean", notNull: true, default: true },
    preparation_minutes: { type: "smallint", notNull: true, default: 30 },
    orders_paused: { type: "boolean", notNull: true, default: false },
    orders_paused_until: { type: "timestamptz" },
  });
  pgm.addConstraint("users", "users_preparation_minutes_valid", {
    check: "preparation_minutes IN (15, 30, 45, 60, 90, 120)",
  });
  pgm.addConstraint("users", "users_orders_pause_valid", {
    check: "orders_paused_until IS NULL OR orders_paused",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropConstraint("users", "users_orders_pause_valid");
  pgm.dropConstraint("users", "users_preparation_minutes_valid");
  pgm.dropColumns("users", ["delivery_enabled", "preparation_minutes", "orders_paused", "orders_paused_until"]);
};
