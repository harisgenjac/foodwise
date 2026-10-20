/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// The price per unit agreed when the reservation was made, so later product edits do not change it.
// Existing reservations take the product's current discounted price.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumn("reservations", { unit_price: { type: "decimal" } });
  pgm.sql(`
    UPDATE reservations
    SET unit_price = products.discounted_price
    FROM products
    WHERE reservations.product_id = products.id
  `);
  pgm.alterColumn("reservations", "unit_price", { notNull: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumn("reservations", "unit_price");
};
