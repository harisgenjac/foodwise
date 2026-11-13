/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// "Sold in shop" beyond the free quantity: the till sold food that Pending order items still hold.
// Only the free part becomes a product_shop_sales row at once; the rest is remembered here as the
// product's shortage. A store decision cannot accept more than the order's quantity minus the
// shortage, and whatever Pending quantity is freed (a reduced or rejected item, a cancelled order)
// first turns the shortage into shop sales, so food the till already sold never returns to the
// offer.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumn("products", {
    shop_shortage: { type: "decimal", notNull: true, default: 0, check: "shop_shortage >= 0" },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumn("products", "shop_shortage");
};
