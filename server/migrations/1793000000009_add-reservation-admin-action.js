/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// An admin can cancel a Pending or Confirmed reservation; the audit log links the reservation.
// ADD VALUE must be committed before the new value can be used, so this runs outside a transaction.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'CANCEL_RESERVATION'`);
  pgm.addColumn("admin_actions", {
    target_reservation_id: { type: "integer", references: "reservations", onDelete: "SET NULL" },
  });
  pgm.createIndex("admin_actions", "target_reservation_id");
};

// Postgres cannot drop an enum value, so the type is rebuilt without it.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumn("admin_actions", "target_reservation_id");
  pgm.sql(`DELETE FROM admin_actions WHERE action = 'CANCEL_RESERVATION'`);
  pgm.sql(`ALTER TYPE admin_action_type RENAME TO admin_action_type_old`);
  pgm.sql(`
    CREATE TYPE admin_action_type AS ENUM
      ('CREATE_USER', 'RESET_PASSWORD', 'BLOCK_USER', 'UNBLOCK_USER', 'REMOVE_PRODUCT', 'REMOVE_DONATION')
  `);
  pgm.sql(`
    ALTER TABLE admin_actions
    ALTER COLUMN action TYPE admin_action_type USING action::text::admin_action_type
  `);
  pgm.sql(`DROP TYPE admin_action_type_old`);
};
