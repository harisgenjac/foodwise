/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// A company (store chain) sits above its stores. Its COMPANY user is the headquarters login;
// branches (from step 2.2) are STORE users with the same company_id. Admins and restaurants never
// belong to a company. Blocking a company blocks all of its users without touching users.is_blocked.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("companies", {
    id: "id",
    name: { type: "varchar(120)", notNull: true },
    description: { type: "text" },
    logo_url: { type: "varchar(255)" },
    is_blocked: { type: "boolean", notNull: true, default: false },
    blocked_at: { type: "timestamptz" },
    blocked_reason: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.sql(`CREATE UNIQUE INDEX companies_name_lower_unique ON companies (LOWER(name))`);
  pgm.createTrigger("companies", "set_companies_updated_at", {
    when: "BEFORE",
    operation: "UPDATE",
    function: "set_updated_at",
    level: "ROW",
  });

  pgm.addColumn("users", {
    company_id: { type: "integer", references: "companies", onDelete: "RESTRICT" },
  });
  pgm.createIndex("users", "company_id");
  pgm.addConstraint("users", "users_company_matches_role", {
    check: `(role = 'COMPANY' AND company_id IS NOT NULL)
      OR role = 'STORE'
      OR (role IN ('ADMIN', 'RESTAURANT') AND company_id IS NULL)`,
  });

  pgm.addColumn("admin_actions", {
    target_company_id: { type: "integer", references: "companies", onDelete: "SET NULL" },
  });
  pgm.createIndex("admin_actions", "target_company_id");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumn("admin_actions", "target_company_id");
  pgm.sql(`DELETE FROM users WHERE role = 'COMPANY'`);
  pgm.dropConstraint("users", "users_company_matches_role");
  pgm.dropColumn("users", "company_id");
  pgm.dropTable("companies");
};
