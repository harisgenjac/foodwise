/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// What a delivery order remembers from the cart (delivery phase 2):
// - the delivery address: the restaurant's address and its pin when the order was sent, so a later
//   profile change does not move an order on its way;
// - the estimated delivery price from the quote (the final price comes when the store accepts and
//   the delivery is created) and the estimated delivery time.
// A delivery order's pickup_at is the estimated time the courier picks the goods up at the store.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns("orders", {
    delivery_address: { type: "text" },
    delivery_latitude: { type: "double precision" },
    delivery_longitude: { type: "double precision" },
    delivery_fee_estimate: { type: "numeric(10, 2)" },
    delivery_estimated_at: { type: "timestamptz" },
  });
  pgm.addConstraint("orders", "orders_delivery_needs_address", {
    check: `fulfilment_method <> 'DELIVERY' OR (
      pickup_at IS NOT NULL AND delivery_address IS NOT NULL AND delivery_latitude IS NOT NULL
      AND delivery_longitude IS NOT NULL AND delivery_fee_estimate IS NOT NULL AND delivery_estimated_at IS NOT NULL
    )`,
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropConstraint("orders", "orders_delivery_needs_address");
  pgm.dropColumns("orders", [
    "delivery_address",
    "delivery_latitude",
    "delivery_longitude",
    "delivery_fee_estimate",
    "delivery_estimated_at",
  ]);
};
