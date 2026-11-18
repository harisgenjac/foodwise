// Straight-line distance in km between two points (haversine), the same formula as the SQL
// function city_distance_km (baseline migration).
const EARTH_RADIUS_KM = 6371;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

interface Point {
  latitude: number;
  longitude: number;
}

export const haversineKm = (from: Point, to: Point): number => {
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};
