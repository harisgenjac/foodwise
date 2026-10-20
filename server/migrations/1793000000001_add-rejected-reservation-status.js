/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Rejected by the store is now its own status instead of Cancelled. Past rejections are recovered
// from their RESERVATION_REJECTED notifications.
// ADD VALUE must be committed before the new value can be used, so this runs outside a transaction.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'Rejected' AFTER 'Completed'`);
  pgm.sql(`
    UPDATE reservations
    SET status = 'Rejected'
    WHERE reservations.status = 'Cancelled'
      AND reservations.id IN (
        SELECT notifications.reservation_id FROM notifications
        WHERE notifications.type = 'RESERVATION_REJECTED' AND notifications.reservation_id IS NOT NULL
      )
  `);
};

// Postgres cannot drop an enum value, so the type is rebuilt without it.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`UPDATE reservations SET status = 'Cancelled' WHERE status = 'Rejected'`);
  pgm.sql(`ALTER TABLE reservations ALTER COLUMN status DROP DEFAULT`);
  pgm.sql(`ALTER TYPE reservation_status RENAME TO reservation_status_old`);
  pgm.sql(`CREATE TYPE reservation_status AS ENUM ('Pending', 'Confirmed', 'Completed', 'Cancelled')`);
  pgm.sql(`
    ALTER TABLE reservations
    ALTER COLUMN status TYPE reservation_status USING status::text::reservation_status
  `);
  pgm.sql(`ALTER TABLE reservations ALTER COLUMN status SET DEFAULT 'Pending'`);
  pgm.sql(`DROP TYPE reservation_status_old`);
};
