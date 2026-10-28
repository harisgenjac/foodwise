/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Who sent a credit request (the user, or the headquarters for its branch; null for the renewal
// job) and the headquarters' review of a branch's top-up. company_note is the headquarters' reason
// for a rejection and is shown to the branch (unlike admin_note, which stays internal).
// A branch may have one open top-up at a time, whether it waits for its headquarters or for an
// admin, so the one-pending-top-up index now covers both statuses.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns("credit_requests", {
    requested_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    company_note: { type: "text" },
    company_reviewed_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    company_reviewed_at: { type: "timestamptz" },
  });
  pgm.sql(`UPDATE credit_requests SET requested_by = user_id WHERE source = 'USER'`);
  pgm.createIndex("credit_requests", "requested_by");

  pgm.dropIndex("credit_requests", "user_id", { name: "credit_requests_one_pending_topup" });
  pgm.createIndex("credit_requests", "user_id", {
    name: "credit_requests_one_open_topup",
    unique: true,
    where: "request_type = 'TOPUP' AND status IN ('PENDING', 'COMPANY_REVIEW')",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropIndex("credit_requests", "user_id", { name: "credit_requests_one_open_topup" });
  pgm.createIndex("credit_requests", "user_id", {
    name: "credit_requests_one_pending_topup",
    unique: true,
    where: "status = 'PENDING' AND request_type = 'TOPUP'",
  });
  pgm.dropColumns("credit_requests", ["requested_by", "company_note", "company_reviewed_by", "company_reviewed_at"]);
};
