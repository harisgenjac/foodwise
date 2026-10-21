/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Platform administrators. ADD VALUE must be committed before the new value can be used,
// so this runs outside a transaction.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ADMIN'`);
};

// Postgres cannot drop an enum value, so the type is rebuilt without it (admin accounts are deleted).
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`DELETE FROM users WHERE role = 'ADMIN'`);
  pgm.sql(`ALTER TYPE user_role RENAME TO user_role_old`);
  pgm.sql(`CREATE TYPE user_role AS ENUM ('STORE', 'RESTAURANT')`);
  pgm.sql(`ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::text::user_role`);
  pgm.sql(`DROP TYPE user_role_old`);
};
