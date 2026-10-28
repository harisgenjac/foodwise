/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// A company's headquarters (or an admin) deactivates a branch instead of deleting it: the store is
// hidden and cannot sign in while deactivated_at is set. notifications.branch_id names the branch
// a headquarters notification is about.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumn("users", {
    deactivated_at: { type: "timestamptz" },
    deactivated_by: { type: "integer", references: "users", onDelete: "SET NULL" },
  });
  pgm.addColumn("notifications", {
    branch_id: { type: "integer", references: "users", onDelete: "SET NULL" },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumn("notifications", "branch_id");
  pgm.dropColumn("users", ["deactivated_at", "deactivated_by"]);
};
