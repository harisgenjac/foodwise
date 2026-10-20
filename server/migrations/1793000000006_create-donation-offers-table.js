/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Donation offers published by stores and restaurants (humanitarian module). FREE offers are
// given away; SPONSORED ones are given at donation_price, which a third party pays.
// Claim and funding statuses are added by a later migration together with the recipient roles.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createType("donation_type", ["FREE", "SPONSORED"]);
  pgm.createType("donation_status", ["Available", "Expired", "Removed"]);

  pgm.createTable("donation_offers", {
    id: "id",
    donor_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    source_product_id: {
      type: "integer",
      references: "products",
      onDelete: "SET NULL",
    },
    donation_type: { type: "donation_type", notNull: true },
    name: { type: "varchar(255)", notNull: true },
    description: { type: "text" },
    category: { type: "varchar(100)", notNull: true },
    quantity: { type: "decimal", notNull: true },
    unit: { type: "varchar(50)", notNull: true },
    original_price: { type: "decimal", notNull: true },
    donation_price: { type: "decimal" },
    expiry_date: { type: "date", notNull: true },
    pickup_from: { type: "time" },
    pickup_until: { type: "time" },
    allergens: { type: "text[]", notNull: true, default: pgm.func("'{}'") },
    serving_temperature: { type: "varchar(20)" },
    status: { type: "donation_status", notNull: true, default: "Available" },
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

  pgm.addConstraint("donation_offers", "donation_price_matches_type", {
    check:
      "(donation_type = 'FREE' AND donation_price IS NULL) OR (donation_type = 'SPONSORED' AND donation_price > 0)",
  });

  pgm.createTrigger("donation_offers", "set_donation_offers_updated_at", {
    when: "BEFORE",
    operation: "UPDATE",
    function: "set_updated_at",
    level: "ROW",
  });

  pgm.createIndex("donation_offers", "donor_id");
  pgm.createIndex("donation_offers", ["status", "expiry_date"]);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable("donation_offers");
  pgm.dropType("donation_status");
  pgm.dropType("donation_type");
};
