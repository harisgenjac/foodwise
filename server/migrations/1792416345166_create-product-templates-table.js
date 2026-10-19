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
  pgm.createTable("product_templates", {
    id: "id",
    store_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    name: { type: "varchar(255)", notNull: true },
    description: { type: "text" },
    category: { type: "varchar(100)", notNull: true },
    unit: { type: "varchar(50)", notNull: true },
    original_price: { type: "decimal" },
    discounted_price: { type: "decimal" },
    quantity: { type: "decimal" },
    shelf_life_days: { type: "integer" },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint("product_templates", "unique_store_template_name", {
    unique: ["store_id", "name"],
  });

  pgm.createTrigger("product_templates", "set_product_templates_updated_at", {
    when: "BEFORE",
    operation: "UPDATE",
    function: "set_updated_at",
    level: "ROW",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("product_templates");
};
