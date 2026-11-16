/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// The exact location of a store or restaurant, set with a pin on a map on My profile (or by an
// admin). Delivery needs it: the provider prices and routes by coordinates, and a restaurant's
// location is its delivery address. Optional: both are null until the business sets the pin, and
// they are set or cleared together.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns("users", {
    latitude: { type: "double precision" },
    longitude: { type: "double precision" },
  });
  pgm.addConstraint("users", "users_location_valid", {
    check: `(latitude IS NULL AND longitude IS NULL)
      OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)`,
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropConstraint("users", "users_location_valid");
  pgm.dropColumns("users", ["latitude", "longitude"]);
};
