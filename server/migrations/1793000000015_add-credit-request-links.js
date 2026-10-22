/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Credit requests can be created by the user or by the auto-renew job (so the job creates each
// renewal only once, and turning auto-renew off withdraws only the job's pending request), and
// the request notifications link to their request.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createType("credit_request_source", ["USER", "AUTO_RENEW"]);
  pgm.addColumn("credit_requests", {
    source: { type: "credit_request_source", notNull: true, default: "USER" },
  });
  pgm.addColumn("notifications", {
    credit_request_id: { type: "integer", references: "credit_requests", onDelete: "SET NULL" },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumn("notifications", "credit_request_id");
  pgm.dropColumn("credit_requests", "source");
  pgm.dropType("credit_request_source");
};
