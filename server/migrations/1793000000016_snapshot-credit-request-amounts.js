/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// A credit request keeps the credits and price of its plan or package as they were when it was
// sent, so a later change to the plan never changes what an approval grants or what the user was
// quoted (and later invoiced). A trigger fills them on insert from the plan or package, so every
// writer (the API, the renewal job, the seed) gets the same snapshot without repeating the lookup.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns("credit_requests", {
    credits: { type: "integer", check: "credits > 0" },
    price: { type: "decimal(10, 2)", check: "price >= 0" },
  });
  pgm.sql(`
    UPDATE credit_requests
    SET credits = COALESCE(plans.credits_per_period, topup_packages.credits),
        price = COALESCE(plans.price, topup_packages.price)
    FROM credit_requests AS requests
    LEFT JOIN plans ON plans.id = requests.plan_id
    LEFT JOIN topup_packages ON topup_packages.id = requests.topup_package_id
    WHERE requests.id = credit_requests.id
  `);
  pgm.sql(`
    CREATE FUNCTION snapshot_credit_request() RETURNS trigger AS $$
    BEGIN
      IF NEW.credits IS NULL OR NEW.price IS NULL THEN
        IF NEW.plan_id IS NOT NULL THEN
          SELECT COALESCE(NEW.credits, plans.credits_per_period), COALESCE(NEW.price, plans.price)
          INTO NEW.credits, NEW.price
          FROM plans WHERE plans.id = NEW.plan_id;
        ELSE
          SELECT COALESCE(NEW.credits, topup_packages.credits), COALESCE(NEW.price, topup_packages.price)
          INTO NEW.credits, NEW.price
          FROM topup_packages WHERE topup_packages.id = NEW.topup_package_id;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  pgm.sql(`
    CREATE TRIGGER credit_requests_snapshot
    BEFORE INSERT ON credit_requests
    FOR EACH ROW EXECUTE FUNCTION snapshot_credit_request()
  `);
  pgm.alterColumn("credit_requests", "credits", { notNull: true });
  pgm.alterColumn("credit_requests", "price", { notNull: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql("DROP TRIGGER credit_requests_snapshot ON credit_requests");
  pgm.sql("DROP FUNCTION snapshot_credit_request()");
  pgm.dropColumns("credit_requests", ["credits", "price"]);
};
