/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Orders (docs/orders-design.md, section 1). A reservation becomes an order item: `orders` sits
// above the items, which stay in the `reservations` table until the last orders PR renames it to
// order_items. An order is from one store, its status is always derived from its items in the
// same transaction (syncOrderStatus), and order_status_history records every change.
//
// The app is not live, so old test data is not migrated: every reservation is deleted (their
// notifications go with them, admin actions keep their row with the link set to null) together
// with the ledger's reservation rows, and the seed rebuilds demo orders.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  // Old test data. Refunds point at their charges (RESTRICT), so they go first; the ledger only
  // allows deletes with its maintenance switch on.
  pgm.sql(`SET LOCAL app.ledger_maintenance = 'on'`);
  pgm.sql(`DELETE FROM credit_transactions WHERE type = 'RESERVATION_REFUND'`);
  pgm.sql(`DELETE FROM credit_transactions WHERE type = 'RESERVATION_CHARGE'`);
  pgm.sql(`DELETE FROM notifications WHERE reservation_id IS NOT NULL`);
  pgm.sql(`DELETE FROM reservations`);

  pgm.createType("order_status", ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"]);
  // Phase 2 adds DELIVERY (Korpa) with ALTER TYPE ... ADD VALUE.
  pgm.createType("fulfilment_method", ["PICKUP"]);
  pgm.createType("order_change_reason", ["NOT_ENOUGH_STOCK", "QUALITY", "OTHER"]);
  // Phase 2 adds PROVIDER.
  pgm.createType("order_event_source", ["RESTAURANT", "STORE", "ADMIN", "SYSTEM"]);

  pgm.createTable("orders", {
    id: "id",
    store_id: { type: "integer", notNull: true, references: "users", onDelete: "RESTRICT" },
    restaurant_id: { type: "integer", notNull: true, references: "users", onDelete: "RESTRICT" },
    // Random, shown as #K7PM; unique within a store (generateOrderCode).
    code: { type: "char(4)", notNull: true },
    status: { type: "order_status", notNull: true, default: "Pending" },
    fulfilment_method: { type: "fulfilment_method", notNull: true, default: "PICKUP" },
    // Local wall-clock time, like reservations.pickup_date, so pickup_at::date compares with CURRENT_DATE.
    pickup_at: { type: "timestamp" },
    accept_partial: { type: "boolean", notNull: true, default: true },
    decided_at: { type: "timestamptz" },
    // What changed when the order was sent: a display snapshot, never queried.
    send_changes: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    picked_up_at: { type: "timestamptz" },
    // timestamp (not timestamptz) like reservations, so created_at >= CURRENT_DATE is the local day.
    created_at: { type: "timestamp", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamp", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("orders", "orders_pickup_needs_time", {
    check: "fulfilment_method <> 'PICKUP' OR pickup_at IS NOT NULL",
  });
  pgm.addConstraint("orders", "orders_store_code_unique", { unique: ["store_id", "code"] });
  pgm.createIndex("orders", ["restaurant_id", "status"]);
  pgm.createIndex("orders", ["store_id", "status"]);
  pgm.createIndex("orders", ["status", "pickup_at"]);
  pgm.createTrigger("orders", "set_orders_updated_at", {
    when: "BEFORE",
    operation: "UPDATE",
    function: "set_updated_at",
    level: "ROW",
  });

  // The items. quantity is the current quantity: what was sent while Pending, the accepted one
  // after the store's decision; ordered_quantity keeps what the order sent.
  pgm.addColumns("reservations", {
    order_id: { type: "integer", notNull: true, references: "orders", onDelete: "CASCADE" },
    ordered_quantity: { type: "decimal", notNull: true },
    decided_at: { type: "timestamptz" },
    change_reason: { type: "order_change_reason" },
    change_note: { type: "varchar(300)" },
  });
  pgm.createIndex("reservations", "order_id");
  pgm.addConstraint("reservations", "reservations_order_product_unique", { unique: ["order_id", "product_id"] });
  pgm.addConstraint("reservations", "reservations_quantity_within_ordered", {
    check: "quantity <= ordered_quantity",
  });
  pgm.addConstraint("reservations", "reservations_other_reason_has_note", {
    check: "change_reason IS DISTINCT FROM 'OTHER' OR (change_note IS NOT NULL AND btrim(change_note) <> '')",
  });

  pgm.createTable("order_status_history", {
    id: "id",
    order_id: { type: "integer", notNull: true, references: "orders", onDelete: "CASCADE" },
    // Null: the order's status changed; set: one item's.
    item_id: { type: "integer", references: "reservations", onDelete: "CASCADE" },
    from_status: { type: "varchar(20)" },
    to_status: { type: "varchar(20)", notNull: true },
    source: { type: "order_event_source", notNull: true },
    actor_id: { type: "integer", references: "users", onDelete: "SET NULL" },
    reason: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.createIndex("order_status_history", ["order_id", "created_at"]);
  pgm.createIndex("order_status_history", "item_id");
  pgm.createIndex("order_status_history", "actor_id");

  pgm.addColumns("product_shop_sales", {
    // Set when the sale was recorded from an order decision.
    order_id: { type: "integer", references: "orders", onDelete: "SET NULL" },
  });
  pgm.createIndex("product_shop_sales", "order_id");

  pgm.addColumns("notifications", {
    order_id: { type: "integer", references: "orders", onDelete: "SET NULL" },
  });
  pgm.createIndex("notifications", "order_id");

  pgm.addColumns("admin_actions", {
    target_order_id: { type: "integer", references: "orders", onDelete: "SET NULL" },
  });
  pgm.createIndex("admin_actions", "target_order_id");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumns("admin_actions", ["target_order_id"]);
  pgm.dropColumns("notifications", ["order_id"]);
  pgm.dropColumns("product_shop_sales", ["order_id"]);
  pgm.dropTable("order_status_history");
  // Items cannot exist without their order.
  pgm.sql(`DELETE FROM notifications WHERE reservation_id IS NOT NULL`);
  pgm.sql(`DELETE FROM reservations`);
  pgm.dropConstraint("reservations", "reservations_other_reason_has_note");
  pgm.dropConstraint("reservations", "reservations_quantity_within_ordered");
  pgm.dropConstraint("reservations", "reservations_order_product_unique");
  pgm.dropColumns("reservations", ["order_id", "ordered_quantity", "decided_at", "change_reason", "change_note"]);
  pgm.dropTable("orders");
  pgm.dropType("order_event_source");
  pgm.dropType("order_change_reason");
  pgm.dropType("fulfilment_method");
  pgm.dropType("order_status");
};
