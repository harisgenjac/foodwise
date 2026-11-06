/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// "Sold in shop": a store records an amount of a product it sold at its own till, so the app's
// free quantity matches what is really left. One row per entry, never edited or deleted (the app
// has no route for it). It only lowers the free quantity (available = quantity − Pending,
// Confirmed and Completed reservations − sold in shop) and is never counted as an app sale.
// The orders migration adds order_id (an entry recorded from an order decision).
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("product_shop_sales", {
    id: "id",
    product_id: { type: "integer", notNull: true, references: "products", onDelete: "CASCADE" },
    store_id: { type: "integer", notNull: true, references: "users", onDelete: "CASCADE" },
    quantity: { type: "decimal", notNull: true, check: "quantity > 0" },
    // The store login that recorded it.
    created_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("product_shop_sales", "product_id");
  pgm.createIndex("product_shop_sales", "store_id");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable("product_shop_sales");
};
