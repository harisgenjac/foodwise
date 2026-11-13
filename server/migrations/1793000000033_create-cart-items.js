/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// The restaurant's cart (docs/orders-design.md, section 4): one line per product, all from one
// store (the API keeps that rule). A line holds no stock. unit_price_seen is the price when the
// line was added or the restaurant last accepted a new price; GET /cart compares it with the
// current one. Lines of a removed or expired product are deleted by the midnight expiry job a
// day later; a sent order removes its sent lines.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("cart_items", {
    restaurant_id: { type: "integer", notNull: true, references: "users", onDelete: "CASCADE" },
    product_id: { type: "integer", notNull: true, references: "products", onDelete: "CASCADE" },
    quantity: { type: "decimal", notNull: true, check: "quantity > 0" },
    unit_price_seen: { type: "decimal", notNull: true, check: "unit_price_seen >= 0" },
    added_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("cart_items", "cart_items_pkey", { primaryKey: ["restaurant_id", "product_id"] });
  pgm.createIndex("cart_items", "product_id");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable("cart_items");
};
