/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// An admin cancels a whole order (CANCEL_ORDER replaces CANCEL_RESERVATION, which stays in the
// enum for old rows). ADD VALUE must be committed before the new value can be used, so this runs
// outside a transaction; the orders migration after it adds admin_actions.target_order_id.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'CANCEL_ORDER'`);
};

// Postgres cannot drop an enum value, so the type is rebuilt without it.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`DELETE FROM admin_actions WHERE action = 'CANCEL_ORDER'`);
  pgm.sql(`ALTER TYPE admin_action_type RENAME TO admin_action_type_old`);
  pgm.sql(`
    CREATE TYPE admin_action_type AS ENUM
      ('CREATE_USER', 'RESET_PASSWORD', 'BLOCK_USER', 'UNBLOCK_USER', 'REMOVE_PRODUCT', 'REMOVE_DONATION',
       'CANCEL_RESERVATION', 'UPDATE_PROFILE', 'CREATE_ANNOUNCEMENT', 'END_ANNOUNCEMENT',
       'APPROVE_CREDIT_REQUEST', 'REJECT_CREDIT_REQUEST', 'ADJUST_CREDITS',
       'CREATE_COMPANY', 'UPDATE_COMPANY', 'BLOCK_COMPANY', 'UNBLOCK_COMPANY',
       'DEACTIVATE_BRANCH', 'REACTIVATE_BRANCH', 'ATTACH_BRANCH',
       'SEND_INVITATION', 'RESEND_INVITATION', 'SEND_PASSWORD_RESET_LINK')
  `);
  pgm.sql(`
    ALTER TABLE admin_actions
    ALTER COLUMN action TYPE admin_action_type USING action::text::admin_action_type
  `);
  pgm.sql(`DROP TYPE admin_action_type_old`);
};
