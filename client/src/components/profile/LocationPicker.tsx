import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Crosshair, MapPinOff, TriangleAlert } from "lucide-react";
import type { GeoPoint } from "../../types/index.js";

const LocationMap = lazy(() => import("./LocationMap.js"));

// The id the dashboard reminder links to (/my-profile#location).
export const LOCATION_SECTION = "location";

// Where the map starts when neither a pin nor a city is known: Sarajevo.
const DEFAULT_CENTER: GeoPoint = { latitude: 43.8563, longitude: 18.4131 };

interface LocationPickerProps {
  value: GeoPoint | null;
  onChange: (point: GeoPoint | null) => void;
  // The chosen city's centre, where the map looks until the pin is set.
  cityCenter: GeoPoint | null;
}

// The business's exact location for delivery: a pin on the map next to the typed address. A click
// on the map sets it, dragging moves it, "Use my location" takes the device's position. Optional:
// without a pin the section says it is missing (delivery will need it).
function LocationPicker({ value, onChange, cityCenter }: LocationPickerProps) {
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");
  const canLocate = typeof navigator !== "undefined" && "geolocation" in navigator;

  const locateMe = () => {
    setGeoError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setGeoError(t("location.geoError"));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const set = (point: GeoPoint | null) => {
    setGeoError("");
    onChange(point);
  };

  return (
    <div className="space-y-3">
      {value ? (
        <p className="flex items-center gap-2 text-sm font-medium text-green-700" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t("location.set")}
        </p>
      ) : (
        <p
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {t("location.missing")}
        </p>
      )}
      <p className="text-xs text-gray-500">{t("location.hint")}</p>

      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-gray-100 sm:h-80" />}>
        <LocationMap
          value={value}
          center={cityCenter ?? DEFAULT_CENTER}
          onChange={set}
          label={t("location.mapLabel")}
        />
      </Suspense>

      {geoError && <p className="text-sm text-red-600">{geoError}</p>}
      <div className="flex flex-wrap gap-2">
        {canLocate && (
          <button
            type="button"
            onClick={locateMe}
            disabled={locating}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 sm:min-h-0 sm:py-2"
          >
            <Crosshair className="h-4 w-4" />
            {locating ? t("location.locating") : t("location.useMine")}
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={() => set(null)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-medium text-red-600 hover:bg-red-50 sm:min-h-0 sm:py-2"
          >
            <MapPinOff className="h-4 w-4" />
            {t("location.remove")}
          </button>
        )}
      </div>
    </div>
  );
}

export default LocationPicker;
