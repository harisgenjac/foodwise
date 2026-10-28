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

// The marketplace radius (`radius` query param): km from the restaurant's city, or "all".
export const RADIUS_OPTIONS = [5, 10, 20, 50];
export const DEFAULT_RADIUS = 10;

// Missing or empty = the default 10 km, "all" = no limit (null), anything else invalid.
export const parseRadius = (value: unknown): { radius: number | null } | { invalid: true } => {
  if (value === undefined || value === "") return { radius: DEFAULT_RADIUS };
  if (value === "all") return { radius: null };
  const radius = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return RADIUS_OPTIONS.includes(radius) ? { radius } : { invalid: true };
};

// The caller's city, the starting point of every distance (null until the profile is filled in).
export const userCityId = async (db: Pool | PoolClient, userId: number): Promise<number | null> => {
  const result = await db.query<{ city_id: number | null }>("SELECT users.city_id FROM users WHERE users.id = $1", [
    userId,
  ]);
  return result.rows[0]?.city_id ?? null;
};

// The straight-line km between two cities' centres (the `city_distance_km` SQL function, see its
// migration); `from` and `to` are SQL expressions such as a placeholder and a city_id column.
export const cityDistance = (from: string, to: string) => `city_distance_km(${from}, ${to})`;
