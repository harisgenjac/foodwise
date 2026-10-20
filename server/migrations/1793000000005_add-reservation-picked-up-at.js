/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// When the store handed the food over (status Completed). Reservations completed before
// this column existed get their last update time.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumn("reservations", {
    picked_up_at: { type: "timestamptz" },
  });
  pgm.sql("UPDATE reservations SET picked_up_at = updated_at WHERE status = 'Completed'");
  pgm.createIndex("reservations", ["status", "pickup_date"]);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropIndex("reservations", ["status", "pickup_date"]);
  pgm.dropColumn("reservations", "picked_up_at");
};
