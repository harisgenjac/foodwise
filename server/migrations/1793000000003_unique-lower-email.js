/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Emails are case-insensitive: stored in lowercase and unique regardless of case.
// Fails if two existing accounts differ only in letter case; merge or rename one of them first.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.sql(`UPDATE users SET email = LOWER(TRIM(email)) WHERE email <> LOWER(TRIM(email))`);
  pgm.sql(`CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email))`);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`DROP INDEX users_email_lower_unique`);
};
