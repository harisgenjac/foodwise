import type { MigrationBuilder } from "node-pg-migrate";

// The restaurant's My orders shows when each step of a delivery happened: when a courier was
// assigned and when the delivery failed or was cancelled. Existing rows take the time from the
// applied webhook events, or (a delivery that could not be created, or cancelled by an admin) the
// row's last update.
export const up = (pgm: MigrationBuilder) => {
  pgm.sql(`
    ALTER TABLE deliveries
      ADD COLUMN courier_assigned_at timestamp with time zone,
      ADD COLUMN failed_at timestamp with time zone;

    UPDATE deliveries SET courier_assigned_at = events.occurred_at
    FROM (
      SELECT delivery_events.delivery_id, MIN(delivery_events.occurred_at) AS occurred_at
      FROM delivery_events
      WHERE delivery_events.type = 'delivery.courier_assigned' AND delivery_events.applied
      GROUP BY delivery_events.delivery_id
    ) AS events
    WHERE events.delivery_id = deliveries.id;

    UPDATE deliveries SET failed_at = COALESCE(
      (SELECT MAX(delivery_events.occurred_at) FROM delivery_events
       WHERE delivery_events.delivery_id = deliveries.id AND delivery_events.applied
         AND delivery_events.type IN ('delivery.failed', 'delivery.cancelled')),
      deliveries.updated_at)
    WHERE deliveries.status IN ('FAILED', 'CANCELLED');
  `);
};

export const down = (pgm: MigrationBuilder) => {
  pgm.sql("ALTER TABLE deliveries DROP COLUMN courier_assigned_at, DROP COLUMN failed_at");
};
