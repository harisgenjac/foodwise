import type { TFunction } from "i18next";

// The marketplace radius (`radius` on GET /products and /users/stores): km from the restaurant's
// city, or "all". The server applies 10 km when the parameter is missing.
export const RADIUS_OPTIONS = ["5", "10", "20", "50", "all"] as const;
export type Radius = (typeof RADIUS_OPTIONS)[number];
export const DEFAULT_RADIUS: Radius = "10";

// The next, wider step offered when results lie beyond the radius: 5 → 10 → 20 → 50 → all.
export const nextRadius = (radius: Radius): Radius =>
  RADIUS_OPTIONS[Math.min(RADIUS_OPTIONS.indexOf(radius) + 1, RADIUS_OPTIONS.length - 1)]!;

// "Kakanj · 16 km", "Visoko · in your city" for the restaurant's own city, or just the city when
// there is no distance (the viewer is a store, or a city is missing on either side).
export const formatCityDistance = (t: TFunction, city: string, distanceKm: number | null | undefined) => {
  if (distanceKm === null || distanceKm === undefined) return city;
  const distance = distanceKm === 0 ? t("radius.inYourCity") : t("radius.km", { km: distanceKm });
  return `${city} · ${distance}`;
};

// The label of the button that widens the radius one step ("Show up to 20 km", "Show all cities").
export const widenLabel = (t: TFunction, radius: Radius) => {
  const next = nextRadius(radius);
  return next === "all" ? t("radius.showAll") : t("radius.showUpTo", { km: next });
};
