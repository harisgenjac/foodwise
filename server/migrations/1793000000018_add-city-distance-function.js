/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// The straight-line (Haversine) distance in whole km between two cities' centres, the one place
// the formula lives (marketplace radius now; branches and donations later). NULL when either id
// is null or unknown; the same city is 0.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.sql(`
    CREATE FUNCTION city_distance_km(from_city integer, to_city integer) RETURNS integer
    LANGUAGE sql STABLE AS $$
      SELECT ROUND(
        2 * 6371 * ASIN(LEAST(1, SQRT(
          POWER(SIN(RADIANS(to_cities.latitude::float8 - from_cities.latitude::float8) / 2), 2)
          + COS(RADIANS(from_cities.latitude::float8)) * COS(RADIANS(to_cities.latitude::float8))
            * POWER(SIN(RADIANS(to_cities.longitude::float8 - from_cities.longitude::float8) / 2), 2)
        )))
      )::integer
      FROM cities AS from_cities, cities AS to_cities
      WHERE from_cities.id = from_city AND to_cities.id = to_city
    $$
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql("DROP FUNCTION city_distance_km(integer, integer)");
};
