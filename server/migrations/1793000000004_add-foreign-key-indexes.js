/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Postgres does not index foreign keys on its own; these cover the marketplace, store and
// reservation lookups and the available-quantity subqueries.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createIndex("products", "store_id");
  pgm.createIndex("products", ["status", "expiry_date"]);
  pgm.createIndex("reservations", ["product_id", "status"]);
  pgm.createIndex("reservations", "restaurant_id");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropIndex("reservations", "restaurant_id");
  pgm.dropIndex("reservations", ["product_id", "status"]);
  pgm.dropIndex("products", ["status", "expiry_date"]);
  pgm.dropIndex("products", "store_id");
};
