/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Delivery phase 2: an order can be delivered (DELIVERY) instead of picked up. ADD VALUE must be
// committed before the value can be used (the next migration's CHECK uses it), so this runs
// outside a transaction.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE fulfilment_method ADD VALUE IF NOT EXISTS 'DELIVERY' AFTER 'PICKUP'`);
};

// Postgres cannot drop an enum value, so the type is rebuilt without it (fails while a delivery
// order exists).
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE orders DROP CONSTRAINT orders_pickup_needs_time;
    ALTER TABLE orders ALTER COLUMN fulfilment_method DROP DEFAULT;
    ALTER TYPE fulfilment_method RENAME TO fulfilment_method_old;
    CREATE TYPE fulfilment_method AS ENUM ('PICKUP');
    ALTER TABLE orders ALTER COLUMN fulfilment_method TYPE fulfilment_method
      USING fulfilment_method::text::fulfilment_method;
    ALTER TABLE orders ALTER COLUMN fulfilment_method SET DEFAULT 'PICKUP';
    DROP TYPE fulfilment_method_old;
    ALTER TABLE orders ADD CONSTRAINT orders_pickup_needs_time
      CHECK (fulfilment_method <> 'PICKUP' OR pickup_at IS NOT NULL);
  `);
};
