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
    pgm.createType("reservation_status", [
        "Pending",
        "Confirmed",
        "Completed",
        "Cancelled",
    ]);

    pgm.createTable("reservations", {
        id: 'id',
        product_id: {
            type: "integer",
            notNull: true,
            references: "products",
            onDelete: "RESTRICT",
        },
        restaurant_id: {
            type: "integer",
            notNull: true,
            references: "users",
            onDelete: "RESTRICT",
        },
        quantity: { type: "decimal", notNull: true },
        status: {
            type: "reservation_status",
            notNull: true,
            default: "Pending",
        },
        pickup_date: { type: "timestamp", notNull: true },
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
    pgm.createTrigger("reservations", "set_reservations_updated_at", {
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
    pgm.dropTrigger("reservations", "set_reservations_updated_at");
    pgm.dropTable("reservations");
    pgm.dropType("reservation_status");
};
