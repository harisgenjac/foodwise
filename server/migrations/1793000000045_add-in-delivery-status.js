/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Delivery phase 2: InDelivery, the courier has picked the goods up and not delivered them yet.
// Until now the courier's pickup completed a delivery order, so it went to history while the
// restaurant was still waiting; now Completed comes with the delivery. Existing delivery orders
// completed by a pickup whose delivery has not been delivered (PICKED_UP, or FAILED after the
// pickup) move back to InDelivery, order and items. Their history rows stay as they are.
// ADD VALUE must be committed before the new value can be used, so this runs outside a transaction.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'InDelivery' AFTER 'Confirmed'`);
  pgm.sql(`ALTER TYPE order_item_status ADD VALUE IF NOT EXISTS 'InDelivery' AFTER 'Confirmed'`);
  pgm.sql(`
    UPDATE order_items
    SET status = 'InDelivery'
    FROM orders
    JOIN deliveries ON deliveries.order_id = orders.id
    WHERE order_items.order_id = orders.id
      AND order_items.status = 'Completed'
      AND orders.status = 'Completed'
      AND orders.fulfilment_method = 'DELIVERY'
      AND deliveries.picked_up_at IS NOT NULL
      AND deliveries.status IN ('PICKED_UP', 'FAILED')
  `);
  pgm.sql(`
    UPDATE orders
    SET status = 'InDelivery'
    FROM deliveries
    WHERE deliveries.order_id = orders.id
      AND orders.status = 'Completed'
      AND orders.fulfilment_method = 'DELIVERY'
      AND deliveries.picked_up_at IS NOT NULL
      AND deliveries.status IN ('PICKED_UP', 'FAILED')
  `);
};

// Postgres cannot drop an enum value, so the values stay; the orders go back to Completed as the
// code before this migration expected.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`UPDATE order_items SET status = 'Completed' WHERE status = 'InDelivery'`);
  pgm.sql(`UPDATE orders SET status = 'Completed' WHERE status = 'InDelivery'`);
};
