import type { Pool, PoolClient } from "pg";
import { cityDistance } from "./cities.js";

// A business's exact location: the pin on the map on My profile (users.latitude/longitude).
interface Location {
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

// Straight-line km between two businesses' map pins (`from` and `to` are table aliases with
// latitude/longitude), the haversine of city_distance_km and delivery/distance.ts; NULL when
// either has no pin.
export const pinDistance = (from: string, to: string) => `CASE WHEN ${to}.latitude IS NOT NULL AND ${from}.latitude IS NOT NULL THEN
  2 * 6371 * ASIN(LEAST(1, SQRT(
    POWER(SIN(RADIANS(${to}.latitude - ${from}.latitude) / 2), 2)
    + COS(RADIANS(${from}.latitude)) * COS(RADIANS(${to}.latitude)) * POWER(SIN(RADIANS(${to}.longitude - ${from}.longitude) / 2), 2)
  ))) END`;

// The distance a restaurant (`from`) sees to a store (`to`): between the two pins, or between the
// two cities' centres when either has no pin (whole km); NULL when a city is missing too.
export const businessDistance = (from: string, to: string) =>
  `COALESCE(${pinDistance(from, to)}, ${cityDistance(`${from}.city_id`, `${to}.city_id`)})`;
