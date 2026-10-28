/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// A company's headquarters asks and pays for its branches' credits. A branch's top-up request first
// waits for its headquarters (COMPANY_REVIEW), which forwards it to the admin (PENDING) or rejects it
// (COMPANY_REJECTED). The source tells who started a request: the headquarters for a branch (COMPANY)
// or the branch asking its headquarters (BRANCH).
// ADD VALUE must be committed before the new values can be used, so this runs outside a transaction.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE credit_request_status ADD VALUE IF NOT EXISTS 'COMPANY_REVIEW'`);
  pgm.sql(`ALTER TYPE credit_request_status ADD VALUE IF NOT EXISTS 'COMPANY_REJECTED'`);
  pgm.sql(`ALTER TYPE credit_request_source ADD VALUE IF NOT EXISTS 'COMPANY'`);
  pgm.sql(`ALTER TYPE credit_request_source ADD VALUE IF NOT EXISTS 'BRANCH'`);
};

// Postgres cannot drop an enum value, so both types are rebuilt without them. Requests that never
// reached an admin are deleted; the others keep their status and become USER requests.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`UPDATE notifications SET credit_request_id = NULL
    WHERE credit_request_id IN (
      SELECT id FROM credit_requests WHERE status IN ('COMPANY_REVIEW', 'COMPANY_REJECTED'))`);
  pgm.sql(`DELETE FROM credit_requests WHERE status IN ('COMPANY_REVIEW', 'COMPANY_REJECTED')`);
  pgm.sql(`UPDATE credit_requests SET source = 'USER' WHERE source IN ('COMPANY', 'BRANCH')`);

  pgm.sql(`DROP INDEX IF EXISTS credit_requests_one_pending_subscription`);
  pgm.sql(`DROP INDEX IF EXISTS credit_requests_one_pending_topup`);
  pgm.sql(`DROP INDEX IF EXISTS credit_requests_status_created_at_index`);
  pgm.sql(`ALTER TABLE credit_requests ALTER COLUMN status DROP DEFAULT`);
  pgm.sql(`ALTER TYPE credit_request_status RENAME TO credit_request_status_old`);
  pgm.sql(`CREATE TYPE credit_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED')`);
  pgm.sql(`ALTER TABLE credit_requests
    ALTER COLUMN status TYPE credit_request_status USING status::text::credit_request_status`);
  pgm.sql(`ALTER TABLE credit_requests ALTER COLUMN status SET DEFAULT 'PENDING'`);
  pgm.sql(`DROP TYPE credit_request_status_old`);
  pgm.sql(`CREATE UNIQUE INDEX credit_requests_one_pending_subscription ON credit_requests (user_id, period_month)
    WHERE status = 'PENDING' AND request_type = 'SUBSCRIPTION'`);
  pgm.sql(`CREATE UNIQUE INDEX credit_requests_one_pending_topup ON credit_requests (user_id)
    WHERE status = 'PENDING' AND request_type = 'TOPUP'`);
  pgm.sql(`CREATE INDEX credit_requests_status_created_at_index ON credit_requests (status, created_at)`);

  pgm.sql(`ALTER TABLE credit_requests ALTER COLUMN source DROP DEFAULT`);
  pgm.sql(`ALTER TYPE credit_request_source RENAME TO credit_request_source_old`);
  pgm.sql(`CREATE TYPE credit_request_source AS ENUM ('USER', 'AUTO_RENEW')`);
  pgm.sql(`ALTER TABLE credit_requests
    ALTER COLUMN source TYPE credit_request_source USING source::text::credit_request_source`);
  pgm.sql(`ALTER TABLE credit_requests ALTER COLUMN source SET DEFAULT 'USER'`);
  pgm.sql(`DROP TYPE credit_request_source_old`);
};
