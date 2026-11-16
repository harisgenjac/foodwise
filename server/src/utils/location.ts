import type { Pool, PoolClient } from "pg";

// A business's exact location: the pin on the map on My profile (users.latitude/longitude).
export interface Location {
  latitude: number;
  longitude: number;
}

// The pin must lie near the chosen city's centre, which catches a pin dropped in the wrong place.
// Every city in the list is a municipality, so 30 km covers its whole area.
export const MAX_KM_FROM_CITY = 30;

// Stored with 6 decimals (about 10 cm), more than a map click is precise.
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

const coordinate = (value: unknown, limit: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit ? round6(value) : null;

// The `location` field of a profile update: not sent (undefined) keeps the stored pin, null clears
// it, otherwise { latitude, longitude } as numbers.
export const parseLocation = (
  value: unknown,
): undefined | { value: Location | null } | { invalid: true } => {
  if (value === undefined) return undefined;
  if (value === null) return { value: null };
  if (typeof value !== "object" || Array.isArray(value)) return { invalid: true };
  const { latitude, longitude } = value as Record<string, unknown>;
  const lat = coordinate(latitude, 90);
  const lng = coordinate(longitude, 180);
  if (lat === null || lng === null) return { invalid: true };
  return { value: { latitude: lat, longitude: lng } };
};

// Straight-line km from a city's centre to a point (the formula of city_distance_km).
export const kmFromCity = async (db: Pool | PoolClient, cityId: number, point: Location): Promise<number | null> => {
  const result = await db.query<{ km: number }>(
    `SELECT 2 * 6371 * ASIN(LEAST(1, SQRT(
       POWER(SIN(RADIANS($2::float8 - cities.latitude::float8) / 2), 2)
       + COS(RADIANS(cities.latitude::float8)) * COS(RADIANS($2::float8))
       * POWER(SIN(RADIANS($3::float8 - cities.longitude::float8) / 2), 2)
     ))) AS km
     FROM cities WHERE cities.id = $1`,
    [cityId, point.latitude, point.longitude],
  );
  return result.rows[0]?.km ?? null;
};
