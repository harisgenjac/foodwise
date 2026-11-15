/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// The orders cleanup (docs/orders-design.md, section 11, PR 6). Order items keep living in the
// old reservations table; this gives it and everything named after it the order_items name, drops
// the items' pickup_date (the order's pickup_at replaced it) and removes the reservation-era
// history nothing writes any more: notifications.reservation_id (notifications link the order),
// the admin action CANCEL_RESERVATION and admin_actions.target_reservation_id (CANCEL_ORDER
// targets the order) and the restaurants' RESERVATION_CHARGE / RESERVATION_REFUND ledger rows (restaurants
// pay no credits). The app is not live yet, so those old rows are deleted rather than kept.

// Derived names that ALTER TABLE ... RENAME keeps: [old, new].
const INDEXES = [
  ["reservations_product_id_status_index", "order_items_product_id_status_index"],
  ["reservations_restaurant_id_index", "order_items_restaurant_id_index"],
  ["reservations_order_id_index", "order_items_order_id_index"],
];
const CONSTRAINTS = [
  ["reservations_pkey", "order_items_pkey"],
  ["reservations_product_id_fkey", "order_items_product_id_fkey"],
  ["reservations_restaurant_id_fkey", "order_items_restaurant_id_fkey"],
  ["reservations_order_id_fkey", "order_items_order_id_fkey"],
  ["reservations_order_product_unique", "order_items_order_product_unique"],
  ["reservations_quantity_within_ordered", "order_items_quantity_within_ordered"],
  ["reservations_other_reason_has_note", "order_items_other_reason_has_note"],
];

const ADMIN_ACTIONS = [
  "CREATE_USER", "RESET_PASSWORD", "BLOCK_USER", "UNBLOCK_USER", "REMOVE_PRODUCT", "REMOVE_DONATION",
  "UPDATE_PROFILE", "CREATE_ANNOUNCEMENT", "END_ANNOUNCEMENT",
  "APPROVE_CREDIT_REQUEST", "REJECT_CREDIT_REQUEST", "ADJUST_CREDITS",
  "CREATE_COMPANY", "UPDATE_COMPANY", "BLOCK_COMPANY", "UNBLOCK_COMPANY",
  "DEACTIVATE_BRANCH", "REACTIVATE_BRANCH", "ATTACH_BRANCH",
  "SEND_INVITATION", "RESEND_INVITATION", "SEND_PASSWORD_RESET_LINK", "CANCEL_ORDER",
];

const list = (values) => values.map((value) => `'${value}'`).join(", ");

// Postgres cannot drop an enum value: the type is rebuilt and the column cast over.
const rebuildEnum = (pgm, type, table, column, values) => {
  pgm.sql(`ALTER TYPE ${type} RENAME TO ${type}_old`);
  pgm.sql(`CREATE TYPE ${type} AS ENUM (${list(values)})`);
  pgm.sql(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${type} USING ${column}::text::${type}`);
  pgm.sql(`DROP TYPE ${type}_old`);
};

// The ledger's checks that name the transaction types, for the given charge and refund types.
const ledgerChecks = (pgm, { grants, charges, refunds, entities }) => {
  pgm.sql(`
    ALTER TABLE credit_transactions
      ADD CONSTRAINT credit_amount_matches_type CHECK (
        (type IN (${list([...grants, ...refunds])}) AND amount > 0)
        OR (type IN (${list(charges)}) AND amount < 0)
        OR (type = 'ADMIN_ADJUSTMENT' AND amount <> 0)),
      ADD CONSTRAINT credit_refund_has_charge CHECK ((type IN (${list(refunds)})) = (refunds_transaction_id IS NOT NULL)),
      ADD CONSTRAINT credit_transactions_related_entity_type_check CHECK (related_entity_type IN (${list(entities)}))
  `);
};
const dropLedgerChecks = (pgm) =>
  pgm.sql(`
    ALTER TABLE credit_transactions
      DROP CONSTRAINT credit_amount_matches_type,
      DROP CONSTRAINT credit_refund_has_charge,
      DROP CONSTRAINT credit_transactions_related_entity_type_check
  `);

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  // The table, its type, sequence, trigger, indexes and constraints.
  pgm.sql("ALTER TABLE reservations RENAME TO order_items");
  pgm.sql("ALTER TYPE reservation_status RENAME TO order_item_status");
  pgm.sql("ALTER SEQUENCE reservations_id_seq RENAME TO order_items_id_seq");
  pgm.sql("ALTER TRIGGER set_reservations_updated_at ON order_items RENAME TO set_order_items_updated_at");
  for (const [from, to] of INDEXES) pgm.sql(`ALTER INDEX ${from} RENAME TO ${to}`);
  for (const [from, to] of CONSTRAINTS) pgm.sql(`ALTER TABLE order_items RENAME CONSTRAINT ${from} TO ${to}`);

  // The items' pickup day; the order's pickup_at is the only one. Its index goes with it.
  pgm.dropColumn("order_items", "pickup_date");

  // Notifications link the order (order_id) since orders; reservation_id was only read for old
  // reservation notifications.
  pgm.dropColumn("notifications", "reservation_id");

  // CANCEL_RESERVATION and its target column: no path writes them since orders (CANCEL_ORDER
  // targets the order). The column's index and foreign key go with it.
  pgm.sql("DELETE FROM admin_actions WHERE action = 'CANCEL_RESERVATION'");
  pgm.dropColumn("admin_actions", "target_reservation_id");
  rebuildEnum(pgm, "admin_action_type", "admin_actions", "action", ADMIN_ACTIONS);

  // Restaurants' credit rows: none since "Restaurants pay no credits". The ledger is append-only,
  // so its maintenance switch lets these deletes through (as in the orders migration).
  pgm.sql("SET LOCAL app.ledger_maintenance = 'on'");
  pgm.sql("DELETE FROM credit_transactions WHERE type = 'RESERVATION_REFUND'");
  pgm.sql("DELETE FROM credit_transactions WHERE type = 'RESERVATION_CHARGE' OR related_entity_type = 'reservation'");
  dropLedgerChecks(pgm);
  rebuildEnum(pgm, "credit_transaction_type", "credit_transactions", "type", [
    "PLAN_GRANT", "TOPUP_GRANT", "ADMIN_ADJUSTMENT", "PRODUCT_CHARGE", "PRODUCT_REFUND",
  ]);
  ledgerChecks(pgm, {
    grants: ["PLAN_GRANT", "TOPUP_GRANT"],
    charges: ["PRODUCT_CHARGE"],
    refunds: ["PRODUCT_REFUND"],
    entities: ["product", "credit_request"],
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  // The deleted history rows do not come back; only the types and names do.
  dropLedgerChecks(pgm);
  rebuildEnum(pgm, "credit_transaction_type", "credit_transactions", "type", [
    "PLAN_GRANT", "TOPUP_GRANT", "ADMIN_ADJUSTMENT", "PRODUCT_CHARGE", "PRODUCT_REFUND",
    "RESERVATION_CHARGE", "RESERVATION_REFUND",
  ]);
  ledgerChecks(pgm, {
    grants: ["PLAN_GRANT", "TOPUP_GRANT"],
    charges: ["PRODUCT_CHARGE", "RESERVATION_CHARGE"],
    refunds: ["PRODUCT_REFUND", "RESERVATION_REFUND"],
    entities: ["product", "reservation", "credit_request"],
  });
  rebuildEnum(pgm, "admin_action_type", "admin_actions", "action", [...ADMIN_ACTIONS, "CANCEL_RESERVATION"]);

  pgm.addColumn("admin_actions", {
    target_reservation_id: { type: "integer", references: "order_items", onDelete: "SET NULL" },
  });
  pgm.createIndex("admin_actions", "target_reservation_id");
  pgm.addColumn("notifications", {
    reservation_id: { type: "integer", references: "order_items", onDelete: "SET NULL" },
  });

  // Back as before, filled from the order's pickup.
  pgm.addColumn("order_items", { pickup_date: { type: "timestamp" } });
  pgm.sql("UPDATE order_items SET pickup_date = orders.pickup_at FROM orders WHERE orders.id = order_items.order_id");
  pgm.sql("ALTER TABLE order_items ALTER COLUMN pickup_date SET NOT NULL");
  pgm.createIndex("order_items", ["status", "pickup_date"], { name: "order_items_status_pickup_date_index" });

  for (const [from, to] of CONSTRAINTS) pgm.sql(`ALTER TABLE order_items RENAME CONSTRAINT ${to} TO ${from}`);
  for (const [from, to] of INDEXES) pgm.sql(`ALTER INDEX ${to} RENAME TO ${from}`);
  pgm.sql("ALTER INDEX order_items_status_pickup_date_index RENAME TO reservations_status_pickup_date_index");
  pgm.sql("ALTER TRIGGER set_order_items_updated_at ON order_items RENAME TO set_reservations_updated_at");
  pgm.sql("ALTER SEQUENCE order_items_id_seq RENAME TO reservations_id_seq");
  pgm.sql("ALTER TYPE order_item_status RENAME TO reservation_status");
  pgm.sql("ALTER TABLE order_items RENAME TO reservations");
};
