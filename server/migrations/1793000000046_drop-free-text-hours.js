/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// The free-text opening and pickup hours: the weekly schedules (opening_schedule,
// pickup_schedule) are the only source of a business's hours now.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.dropColumns("users", ["opening_hours", "pickup_hours"]);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.addColumns("users", {
    opening_hours: { type: "varchar(255)" },
    pickup_hours: { type: "varchar(255)" },
  });
};
