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
  pgm.addColumns("notifications", {
    type: { type: "varchar(40)" },
    reservation_id: {
      type: "integer",
      references: "reservations",
      onDelete: "SET NULL",
    },
    product_id: {
      type: "integer",
      references: "products",
      onDelete: "SET NULL",
    },
  });

  pgm.createIndex("notifications", ["user_id", "created_at"]);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropIndex("notifications", ["user_id", "created_at"]);
  pgm.dropColumns("notifications", ["type", "reservation_id", "product_id"]);
};
