/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Monthly credits: stores pay 1 credit per published product, restaurants 1 per reservation.
// Plans and top-up packages are data, subscriptions are per calendar month (Europe/London),
// and credit_transactions is an append-only ledger: the balance is always the sum of its rows.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createType("subscription_status", ["ACTIVE", "CANCELLED"]);
  pgm.createType("credit_transaction_type", [
    "PLAN_GRANT",
    "TOPUP_GRANT",
    "ADMIN_ADJUSTMENT",
    "PRODUCT_CHARGE",
    "PRODUCT_REFUND",
    "RESERVATION_CHARGE",
    "RESERVATION_REFUND",
  ]);
  pgm.createType("credit_actor", ["USER", "ADMIN", "SYSTEM"]);
  pgm.createType("credit_request_type", ["SUBSCRIPTION", "TOPUP"]);
  // CANCELLED = withdrawn by the user, EXPIRED = its month ended before an admin decided.
  pgm.createType("credit_request_status", ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"]);

  pgm.createTable("plans", {
    id: "id",
    name: { type: "varchar(50)", notNull: true, unique: true },
    credits_per_period: { type: "integer", notNull: true, check: "credits_per_period > 0" },
    price: { type: "decimal(10, 2)", notNull: true, check: "price >= 0" },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });

  pgm.createTable("topup_packages", {
    id: "id",
    credits: { type: "integer", notNull: true, unique: true, check: "credits > 0" },
    price: { type: "decimal(10, 2)", notNull: true, check: "price >= 0" },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });

  // Placeholder prices in KM until the real ones are set.
  pgm.sql(`
    INSERT INTO plans (name, credits_per_period, price) VALUES
      ('Basic', 20, 15.00), ('Standard', 50, 30.00), ('Pro', 150, 75.00)
  `);
  pgm.sql(`
    INSERT INTO topup_packages (credits, price) VALUES (10, 8.00), (20, 15.00), (50, 35.00)
  `);

  pgm.createTable("credit_requests", {
    id: "id",
    user_id: { type: "integer", notNull: true, references: "users", onDelete: "CASCADE" },
    request_type: { type: "credit_request_type", notNull: true },
    plan_id: { type: "integer", references: "plans", onDelete: "RESTRICT" },
    topup_package_id: { type: "integer", references: "topup_packages", onDelete: "RESTRICT" },
    // First day of the month the request is for.
    period_month: { type: "date", notNull: true, check: "EXTRACT(DAY FROM period_month) = 1" },
    auto_renew: { type: "boolean", notNull: true, default: false },
    status: { type: "credit_request_status", notNull: true, default: "PENDING" },
    // Internal: never returned by user-facing endpoints.
    admin_note: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    reviewed_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    reviewed_at: { type: "timestamptz" },
  });
  pgm.addConstraint("credit_requests", "credit_request_target_matches_type", {
    check: `(request_type = 'SUBSCRIPTION' AND plan_id IS NOT NULL AND topup_package_id IS NULL)
         OR (request_type = 'TOPUP' AND topup_package_id IS NOT NULL AND plan_id IS NULL)`,
  });
  // Enforced by the database, not only in code: two parallel submits cannot both be pending.
  pgm.createIndex("credit_requests", ["user_id", "period_month"], {
    name: "credit_requests_one_pending_subscription",
    unique: true,
    where: "status = 'PENDING' AND request_type = 'SUBSCRIPTION'",
  });
  pgm.createIndex("credit_requests", "user_id", {
    name: "credit_requests_one_pending_topup",
    unique: true,
    where: "status = 'PENDING' AND request_type = 'TOPUP'",
  });
  pgm.createIndex("credit_requests", ["status", "created_at"]);

  pgm.createTable("subscriptions", {
    id: "id",
    user_id: { type: "integer", notNull: true, references: "users", onDelete: "CASCADE" },
    plan_id: { type: "integer", notNull: true, references: "plans", onDelete: "RESTRICT" },
    credit_request_id: { type: "integer", references: "credit_requests", onDelete: "SET NULL" },
    // The period is the whole calendar month starting on this day (Europe/London).
    period_month: { type: "date", notNull: true, check: "EXTRACT(DAY FROM period_month) = 1" },
    status: { type: "subscription_status", notNull: true, default: "ACTIVE" },
    auto_renew: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("subscriptions", "unique_user_period", { unique: ["user_id", "period_month"] });

  pgm.createTable("credit_transactions", {
    id: "id",
    // RESTRICT: the ledger is history, like reservations.
    user_id: { type: "integer", notNull: true, references: "users", onDelete: "RESTRICT" },
    subscription_id: { type: "integer", references: "subscriptions", onDelete: "RESTRICT" },
    // The month whose balance this row counts towards (first day of the month).
    period_month: { type: "date", notNull: true, check: "EXTRACT(DAY FROM period_month) = 1" },
    amount: { type: "integer", notNull: true },
    type: { type: "credit_transaction_type", notNull: true },
    reason: { type: "text" },
    related_entity_type: { type: "varchar(20)", check: "related_entity_type IN ('product', 'reservation', 'credit_request')" },
    related_entity_id: { type: "integer" },
    // Category snapshot of the charged product, so later edits do not move past usage.
    category: { type: "varchar(50)" },
    // UNIQUE: a charge can be refunded at most once.
    refunds_transaction_id: { type: "integer", unique: true, references: "credit_transactions", onDelete: "RESTRICT" },
    actor: { type: "credit_actor", notNull: true },
    created_by_user_id: { type: "integer", references: "users", onDelete: "RESTRICT" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("credit_transactions", "credit_amount_matches_type", {
    check: `(type IN ('PLAN_GRANT', 'TOPUP_GRANT', 'PRODUCT_REFUND', 'RESERVATION_REFUND') AND amount > 0)
         OR (type IN ('PRODUCT_CHARGE', 'RESERVATION_CHARGE') AND amount < 0)
         OR (type = 'ADMIN_ADJUSTMENT' AND amount <> 0)`,
  });
  pgm.addConstraint("credit_transactions", "credit_refund_has_charge", {
    check: `(type IN ('PRODUCT_REFUND', 'RESERVATION_REFUND')) = (refunds_transaction_id IS NOT NULL)`,
  });
  pgm.createIndex("credit_transactions", ["user_id", "period_month"]);
  pgm.createIndex("credit_transactions", ["related_entity_type", "related_entity_id"]);

  // Append-only: rows are never changed. Deleting is refused too, except in a transaction that
  // sets app.ledger_maintenance = 'on' (the demo seed and test cleanup), so history cannot be lost
  // by accident.
  pgm.sql(`
    CREATE FUNCTION protect_credit_ledger() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND current_setting('app.ledger_maintenance', true) = 'on' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'credit_transactions is append-only';
    END;
    $$ LANGUAGE plpgsql
  `);
  pgm.sql(`
    CREATE TRIGGER credit_transactions_append_only
    BEFORE UPDATE OR DELETE ON credit_transactions
    FOR EACH ROW EXECUTE FUNCTION protect_credit_ledger()
  `);

  pgm.addColumn("admin_actions", {
    target_credit_request_id: { type: "integer", references: "credit_requests", onDelete: "SET NULL" },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumn("admin_actions", "target_credit_request_id");
  pgm.dropTable("credit_transactions");
  pgm.sql("DROP FUNCTION protect_credit_ledger()");
  pgm.dropTable("subscriptions");
  pgm.dropTable("credit_requests");
  pgm.dropTable("topup_packages");
  pgm.dropTable("plans");
  pgm.dropType("credit_request_status");
  pgm.dropType("credit_request_type");
  pgm.dropType("credit_actor");
  pgm.dropType("credit_transaction_type");
  pgm.dropType("subscription_status");
};
