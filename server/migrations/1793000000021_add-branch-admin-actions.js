/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Branches: an admin deactivates, reactivates or attaches a company's store.
// ADD VALUE must be committed before the new value can be used, so this runs outside a transaction.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'DEACTIVATE_BRANCH'`);
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'REACTIVATE_BRANCH'`);
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'ATTACH_BRANCH'`);
};

// Postgres cannot drop an enum value, so the type is rebuilt without them.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`DELETE FROM admin_actions WHERE action IN ('DEACTIVATE_BRANCH', 'REACTIVATE_BRANCH', 'ATTACH_BRANCH')`);
  pgm.sql(`ALTER TYPE admin_action_type RENAME TO admin_action_type_old`);
  pgm.sql(`
    CREATE TYPE admin_action_type AS ENUM
      ('CREATE_USER', 'RESET_PASSWORD', 'BLOCK_USER', 'UNBLOCK_USER', 'REMOVE_PRODUCT', 'REMOVE_DONATION',
       'CANCEL_RESERVATION', 'UPDATE_PROFILE', 'CREATE_ANNOUNCEMENT', 'END_ANNOUNCEMENT',
       'APPROVE_CREDIT_REQUEST', 'REJECT_CREDIT_REQUEST', 'ADJUST_CREDITS',
       'CREATE_COMPANY', 'UPDATE_COMPANY', 'BLOCK_COMPANY', 'UNBLOCK_COMPANY')
  `);
  pgm.sql(`
    ALTER TABLE admin_actions
    ALTER COLUMN action TYPE admin_action_type USING action::text::admin_action_type
  `);
  pgm.sql(`DROP TYPE admin_action_type_old`);
};
