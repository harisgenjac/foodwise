/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// 'Reserved' was never used: reservations reduce the available quantity and a product goes
// straight from Available to Sold. Postgres cannot drop an enum value, so the type is rebuilt.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.sql(`UPDATE products SET status = 'Available' WHERE status = 'Reserved'`);
  pgm.sql(`ALTER TABLE products ALTER COLUMN status DROP DEFAULT`);
  pgm.sql(`ALTER TYPE product_status RENAME TO product_status_old`);
  pgm.sql(`CREATE TYPE product_status AS ENUM ('Available', 'Sold', 'Expired', 'Removed')`);
  pgm.sql(`
    ALTER TABLE products
    ALTER COLUMN status TYPE product_status USING status::text::product_status
  `);
  pgm.sql(`ALTER TABLE products ALTER COLUMN status SET DEFAULT 'Available'`);
  pgm.sql(`DROP TYPE product_status_old`);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`ALTER TYPE product_status ADD VALUE IF NOT EXISTS 'Reserved' AFTER 'Available'`);
};
