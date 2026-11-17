/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Delivery phase 2, webhooks: the provider's status events.
// - delivery_events keeps every processed webhook event, unique per provider and event_id, so a
//   repeated event (the provider retries until it gets a 2xx) is applied once.
// - deliveries.picked_up_at / delivered_at: when the courier picked the goods up and delivered
//   them (a FAILED delivery with picked_up_at failed after the pickup).
// - PROVIDER: the delivery provider as the source of an order's status change (the courier's
//   pickup completes a delivery order). ADD VALUE runs outside a transaction (see 040).
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE order_event_source ADD VALUE IF NOT EXISTS 'PROVIDER'`);
  pgm.addColumns("deliveries", {
    picked_up_at: { type: "timestamptz" },
    delivered_at: { type: "timestamptz" },
  });
  pgm.createTable("delivery_events", {
    id: "id",
    delivery_id: { type: "integer", notNull: true, references: "deliveries", onDelete: "CASCADE" },
    provider: { type: "varchar(20)", notNull: true },
    event_id: { type: "varchar(100)", notNull: true },
    type: { type: "varchar(40)", notNull: true },
    occurred_at: { type: "timestamptz", notNull: true },
    // Whether the event changed the delivery (false: out of order or after it closed).
    applied: { type: "boolean", notNull: true },
    received_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("delivery_events", "delivery_events_event_unique", { unique: ["provider", "event_id"] });
  pgm.createIndex("delivery_events", "delivery_id");
};

// The PROVIDER value stays in order_event_source: Postgres cannot drop an enum value, and history
// rows may use it.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable("delivery_events");
  pgm.dropColumns("deliveries", ["picked_up_at", "delivered_at"]);
};
