import { useEffect, useState } from "react";
import api from "../api/axios.js";
import type { City } from "../types/index.js";

// The city list is fixed reference data, so it is fetched once per session and shared by every
// CitySelect. A failed request is forgotten, so the next mount tries again.
let citiesRequest: Promise<City[]> | null = null;

const loadCities = () => {
  citiesRequest ??= api.get<{ cities: City[] }>("/cities").then(
    (response) => response.data.cities,
    (error: unknown) => {
      citiesRequest = null;
      throw error;
    },
  );
  return citiesRequest;
};

// For tests: every test starts without a cached list.
export const resetCitiesCache = () => {
  citiesRequest = null;
};

export function useCities() {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    loadCities()
      .then((list) => {
        if (active) setCities(list);
      })
      .catch((err) => {
        console.error("Error fetching cities:", err);
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { cities, loading, error };
}
