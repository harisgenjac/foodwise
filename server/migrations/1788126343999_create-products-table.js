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
  pgm.createType("product_status", [
    "Available",
    "Reserved",
    "Sold",
    "Expired",
    "Removed",
  ]);

  pgm.createTable("products", {
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
    original_price: { type: "decimal", notNull: true },
    discounted_price: { type: "decimal", notNull: true },
    quantity: { type: "decimal", notNull: true },
    unit: { type: "varchar(50)", notNull: true },
    expiry_date: { type: "date", notNull: true },
    status: { type: "product_status", notNull: true, default: "Available" },
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
  pgm.createFunction(
    "set_updated_at",
    [],
    {
      returns: "trigger",
      language: "plpgsql",
    },
    `
        BEGIN
          NEW.updated_at = current_timestamp;
          RETURN NEW;
        END;
        `,
  );

  pgm.createTrigger("products", "set_products_updated_at", {
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
  pgm.dropTrigger("products", "set_products_updated_at");
  pgm.dropFunction("set_updated_at", []);
  pgm.dropTable("products");
  pgm.dropType("product_status");
};
