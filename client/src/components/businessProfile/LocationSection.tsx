import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Crosshair, MapPin, MapPinned, TriangleAlert } from "lucide-react";
import ConfirmModal from "../common/ConfirmModal.js";
import type { GeoPoint } from "../../types/index.js";

const LocationMap = lazy(() => import("../profile/LocationMap.js"));

// Where the map starts when neither a pin nor a city is known: Sarajevo.
const DEFAULT_CENTER: GeoPoint = { latitude: 43.8563, longitude: 18.4131 };

interface LocationSectionProps {
  value: GeoPoint | null;
  onChange: (point: GeoPoint | null) => void;
  // The chosen city's centre, where the map looks until the pin is set.
  cityCenter: GeoPoint | null;
  addressLine: string;
}

// "Lokacija": the map with the pin (a click sets it, the pin can be dragged), the address line,
// "Koristi moju trenutnu lokaciju" and "Ukloni lokaciju". The first pin is set at once; once there
// is a pin, every change asks first (it is easy to move it by accident), and Cancel puts it back.
// Saved with the rest of the page.
function LocationSection({ value, onChange, cityCenter, addressLine }: LocationSectionProps) {
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");
  // A change waiting for "Promijeniti lokaciju?", or "remove" for "Ukloniti lokaciju?".
  const [pending, setPending] = useState<GeoPoint | "remove" | null>(null);
  // Remounted after a cancelled drag, so the pin jumps back to the saved place.
  const [mapKey, setMapKey] = useState(0);
  const canLocate = typeof navigator !== "undefined" && "geolocation" in navigator;

  const propose = (point: GeoPoint) => {
    setGeoError("");
    if (value) setPending(point);
    else onChange(point);
  };

  const locateMe = () => {
    setGeoError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        propose({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setGeoError(t("location.geoError"));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const cancel = () => {
    setPending(null);
    setMapKey((key) => key + 1);
  };

  const confirm = () => {
    onChange(pending === "remove" ? null : pending);
    setPending(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">{t("profile.location.hint")}</p>
      {!value && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("location.missing")}
        </p>
      )}

      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-neutral-100 sm:h-80" />}>
        <div className="overflow-hidden rounded-2xl">
          <LocationMap
            key={mapKey}
            value={value}
            center={cityCenter ?? DEFAULT_CENTER}
            onChange={propose}
            label={t("location.mapLabel")}
          />
        </div>
      </Suspense>

      {geoError && <p className="text-sm text-danger-700">{geoError}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <MapPin className="h-4 w-4 shrink-0 text-brand-800" aria-hidden="true" />
          {addressLine || t("profile.location.noAddress")}
        </p>
        <div className="flex flex-wrap gap-2">
          {canLocate && (
            <button
              type="button"
              onClick={locateMe}
              disabled={locating}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 text-sm font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-60"
            >
              <Crosshair className="h-4 w-4" aria-hidden="true" />
              {locating ? t("location.locating") : t("location.useMine")}
            </button>
          )}
          {value && (
            <button
              type="button"
              onClick={() => setPending("remove")}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 text-sm font-semibold text-danger-700 hover:bg-danger-50"
            >
              {t("location.remove")}
            </button>
          )}
        </div>
      </div>

      {pending && (
        <ConfirmModal
          variant={pending === "remove" ? "danger" : "success"}
          icon={MapPinned}
          title={t(pending === "remove" ? "profile.location.removeTitle" : "profile.location.changeTitle")}
          message={t(pending === "remove" ? "profile.location.removeText" : "profile.location.changeText")}
          confirmLabel={t(pending === "remove" ? "profile.location.removeConfirm" : "profile.location.changeConfirm")}
          busy={false}
          onConfirm={confirm}
          onClose={cancel}
        />
      )}
    </div>
  );
}

export default LocationSection;
