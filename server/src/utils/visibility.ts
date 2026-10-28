// Who counts as blocked, in one place. A user is blocked when their own account is blocked, when
// their company is (a company block never touches users.is_blocked, so unblocking the company
// leaves an individually blocked branch blocked), or, for a company's store (a branch), while it
// is deactivated. Each function returns an SQL fragment for the users row under `alias`; the
// alias is always a fixed name from code, never user input.

export const notBlocked = (alias = "users") =>
  `(${alias}.is_blocked = false AND ${alias}.deactivated_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM companies WHERE companies.id = ${alias}.company_id AND companies.is_blocked
  ))`;

// A store restaurants may see: not blocked (itself or its company), not deactivated and with a
// business name, which an admin-created store gets once it fills in its profile.
export const visibleStore = (alias = "users") =>
  `(${notBlocked(alias)} AND ${alias}.business_name IS NOT NULL)`;
