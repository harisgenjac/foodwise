/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Cities are reference data chosen from a list (nearby offers and store branches need them as
// data, not free text). Coordinates are the approximate municipality centre. Adding a city is a
// new migration; there is no admin UI for them. The old free-text users.city held test data
// only, so it is dropped without carrying values over.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("cities", {
    id: "id",
    name: { type: "varchar(100)", notNull: true, unique: true },
    latitude: { type: "numeric(9, 6)", notNull: true },
    longitude: { type: "numeric(9, 6)", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });

  pgm.sql(`
    INSERT INTO cities (name, latitude, longitude) VALUES
      ('Sarajevo', 43.8563, 18.4131),
      ('Ilidža', 43.8297, 18.3108),
      ('Vogošća', 43.9006, 18.3439),
      ('Hadžići', 43.8228, 18.2014),
      ('Ilijaš', 43.9500, 18.2717),
      ('Visoko', 43.9889, 18.1781),
      ('Breza', 44.0186, 18.2611),
      ('Kakanj', 44.1300, 18.1206),
      ('Vareš', 44.1647, 18.3283),
      ('Olovo', 44.1278, 18.5814),
      ('Zenica', 44.2017, 17.9078),
      ('Žepče', 44.4267, 18.0381),
      ('Zavidovići', 44.4458, 18.1497),
      ('Maglaj', 44.5450, 18.1003),
      ('Tešanj', 44.6114, 17.9858),
      ('Kladanj', 44.2250, 18.6925),
      ('Banovići', 44.4086, 18.5294),
      ('Živinice', 44.4494, 18.6494),
      ('Tuzla', 44.5384, 18.6763),
      ('Lukavac', 44.5425, 18.5250),
      ('Kalesija', 44.4411, 18.8708),
      ('Srebrenik', 44.7064, 18.4886),
      ('Gračanica', 44.7031, 18.3083)
  `);

  pgm.addColumn("users", {
    city_id: { type: "integer", references: "cities", onDelete: "RESTRICT" },
  });
  pgm.createIndex("users", "city_id");
  pgm.dropColumn("users", "city");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.addColumn("users", { city: { type: "varchar(100)" } });
  pgm.dropColumn("users", "city_id");
  pgm.dropTable("cities");
};
