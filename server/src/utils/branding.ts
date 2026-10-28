// What restaurants see of a store. A branch (a store with a company) without its own logo or
// description shows its company's; resolved when reading, so a later change of the company's
// logo shows on every branch that has none of its own. SQL fragments for the users row under
// `alias` (a fixed name from code).

const companyColumn = (alias: string, column: string) =>
  `(SELECT companies.${column} FROM companies WHERE companies.id = ${alias}.company_id)`;

export const storeLogo = (alias = "users") =>
  `COALESCE(NULLIF(${alias}.logo_url, ''), ${companyColumn(alias, "logo_url")})`;

export const storeDescription = (alias = "users") =>
  `COALESCE(NULLIF(${alias}.description, ''), ${companyColumn(alias, "description")})`;

// The chain a store belongs to (null for an independent store).
export const companyName = (alias = "users") => companyColumn(alias, "name");
