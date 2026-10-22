/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Credits: approving or rejecting a subscription/top-up request and adjusting a balance are logged.
// ADD VALUE must be committed before the new value can be used, so this runs outside a transaction.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'APPROVE_CREDIT_REQUEST'`);
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'REJECT_CREDIT_REQUEST'`);
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'ADJUST_CREDITS'`);
};

// Postgres cannot drop an enum value, so the type is rebuilt without them.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(
    `DELETE FROM admin_actions WHERE action IN ('APPROVE_CREDIT_REQUEST', 'REJECT_CREDIT_REQUEST', 'ADJUST_CREDITS')`,
  );
  pgm.sql(`ALTER TYPE admin_action_type RENAME TO admin_action_type_old`);
  pgm.sql(`
    CREATE TYPE admin_action_type AS ENUM
      ('CREATE_USER', 'RESET_PASSWORD', 'BLOCK_USER', 'UNBLOCK_USER', 'REMOVE_PRODUCT', 'REMOVE_DONATION',
       'CANCEL_RESERVATION', 'UPDATE_PROFILE', 'CREATE_ANNOUNCEMENT', 'END_ANNOUNCEMENT')
  `);
  pgm.sql(`
    ALTER TABLE admin_actions
    ALTER COLUMN action TYPE admin_action_type USING action::text::admin_action_type
  `);
  pgm.sql(`DROP TYPE admin_action_type_old`);
};
