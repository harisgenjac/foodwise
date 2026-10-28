import type { Pool, PoolClient } from "pg";
import { parseId } from "./params.js";

// The user's city name for a RETURNING list, where a JOIN is not possible. Read queries join
// `cities` instead (LEFT JOIN: an account without a profile yet has no city).
export const CITY_NAME = "(SELECT cities.name FROM cities WHERE cities.id = users.city_id) AS city";

export const cityExists = async (db: Pool | PoolClient, id: number) => {
  const result = await db.query("SELECT 1 FROM cities WHERE cities.id = $1", [id]);
  return result.rows.length > 0;
};

// A `city_id` query filter: empty or missing = no filter (null), an unknown id = invalid.
export const parseCityFilter = async (
  db: Pool | PoolClient,
  value: unknown,
): Promise<{ cityId: number | null } | { invalid: true }> => {
  if (value === undefined || value === "") return { cityId: null };
  const id = parseId(value);
  if (id === null || !(await cityExists(db, id))) return { invalid: true };
  return { cityId: id };
};
