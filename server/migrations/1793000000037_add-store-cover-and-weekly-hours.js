/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// The store page: a cover image (an upload under /uploads/covers/, like logos) and structured
// opening and pickup hours, one entry per weekday, so the page can say "open now":
//   { "mon": { "open": "08:00", "close": "20:00" }, ..., "sun": null }   (null = closed)
// (checked by src/utils/schedule.ts). The free-text opening_hours and pickup_hours stay for now:
// they cannot be parsed reliably, so My profile shows them as a hint until the business enters
// its weekly hours; a later migration drops them.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns("users", {
    cover_url: { type: "text" },
    opening_schedule: { type: "jsonb" },
    pickup_schedule: { type: "jsonb" },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumns("users", ["cover_url", "opening_schedule", "pickup_schedule"]);
};
