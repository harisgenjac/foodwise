/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Delivery phase 2: the delivery a store's acceptance creates with the provider, one per delivery
// order. A failed creation is kept too (status FAILED with the reason and no provider id), so
// the order shows why no courier is coming. The status follows the provider (CREATED, then the
// webhooks in a later PR). orders.ready_at is when the store said the goods will be ready.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createType("delivery_status", ["CREATED", "COURIER_ASSIGNED", "PICKED_UP", "DELIVERED", "FAILED", "CANCELLED"]);
  pgm.createTable("deliveries", {
    id: "id",
    order_id: { type: "integer", notNull: true, unique: true, references: "orders", onDelete: "CASCADE" },
    // DELIVERY_PROVIDER when it was created ("mock" for now).
    provider: { type: "varchar(20)", notNull: true },
    provider_delivery_id: { type: "varchar(100)" },
    status: { type: "delivery_status", notNull: true },
    // The final delivery price and what the courier collects (accepted goods + price), in KM.
    price: { type: "numeric(10, 2)" },
    cash_to_collect: { type: "numeric(10, 2)" },
    ready_at: { type: "timestamptz", notNull: true },
    estimated_pickup_at: { type: "timestamptz" },
    estimated_delivery_at: { type: "timestamptz" },
    courier_name: { type: "varchar(100)" },
    courier_phone: { type: "varchar(40)" },
    tracking_url: { type: "text" },
    // The provider's code (OUT_OF_ZONE, UNAVAILABLE, ...) or its reason for a failure.
    failure_reason: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("deliveries", "deliveries_created_has_provider_data", {
    check: "status = 'FAILED' OR (provider_delivery_id IS NOT NULL AND price IS NOT NULL AND cash_to_collect IS NOT NULL)",
  });
  pgm.addConstraint("deliveries", "deliveries_provider_id_unique", { unique: ["provider", "provider_delivery_id"] });
  pgm.createTrigger("deliveries", "set_deliveries_updated_at", {
    when: "BEFORE",
    operation: "UPDATE",
    function: "set_updated_at",
    level: "ROW",
  });
  pgm.addColumns("orders", { ready_at: { type: "timestamptz" } });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumns("orders", ["ready_at"]);
  pgm.dropTable("deliveries");
  pgm.dropType("delivery_status");
};
