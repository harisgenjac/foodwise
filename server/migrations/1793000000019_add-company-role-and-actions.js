/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Store chains: the COMPANY role (a chain's headquarters login) and the admin actions on companies.
// ADD VALUE must be committed before the new value can be used, so this runs outside a transaction.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'COMPANY'`);
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'CREATE_COMPANY'`);
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'UPDATE_COMPANY'`);
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'BLOCK_COMPANY'`);
  pgm.sql(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'UNBLOCK_COMPANY'`);
};

// Postgres cannot drop an enum value, so both types are rebuilt without them.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(
    `DELETE FROM admin_actions WHERE action IN ('CREATE_COMPANY', 'UPDATE_COMPANY', 'BLOCK_COMPANY', 'UNBLOCK_COMPANY')`,
  );
  pgm.sql(`ALTER TYPE admin_action_type RENAME TO admin_action_type_old`);
  pgm.sql(`
    CREATE TYPE admin_action_type AS ENUM
      ('CREATE_USER', 'RESET_PASSWORD', 'BLOCK_USER', 'UNBLOCK_USER', 'REMOVE_PRODUCT', 'REMOVE_DONATION',
       'CANCEL_RESERVATION', 'UPDATE_PROFILE', 'CREATE_ANNOUNCEMENT', 'END_ANNOUNCEMENT',
       'APPROVE_CREDIT_REQUEST', 'REJECT_CREDIT_REQUEST', 'ADJUST_CREDITS')
  `);
  pgm.sql(`
    ALTER TABLE admin_actions
    ALTER COLUMN action TYPE admin_action_type USING action::text::admin_action_type
  `);
  pgm.sql(`DROP TYPE admin_action_type_old`);

  pgm.sql(`DELETE FROM users WHERE role = 'COMPANY'`);
  pgm.sql(`ALTER TYPE user_role RENAME TO user_role_old`);
  pgm.sql(`CREATE TYPE user_role AS ENUM ('STORE', 'RESTAURANT', 'ADMIN')`);
  pgm.sql(`ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::text::user_role`);
  pgm.sql(`DROP TYPE user_role_old`);
};
