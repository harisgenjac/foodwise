/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createType('user_role', ['STORE', 'RESTAURANT']);

  pgm.createTable('users', {
    id: 'id',
    first_name: { type: 'varchar(100)', notNull: true },
    last_name: { type: 'varchar(100)', notNull: true },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    role: { type: 'user_role', notNull: true },
    business_name: { type: 'varchar(255)' },
    logo_url: { type: 'text' },
    address: { type: 'varchar(255)' },
    city: { type: 'varchar(100)' },
    opening_hours: { type: 'varchar(255)' },
    pickup_hours: { type: 'varchar(255)' },
    description: { type: 'text' },
    phone: { type: 'varchar(50)' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('users');
  pgm.dropType('user_role');
};
