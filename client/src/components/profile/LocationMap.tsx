import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "../../types/index.js";

// The Leaflet map behind LocationPicker, loaded lazily so the rest of the app does not carry
// Leaflet. A click on the map puts the pin there; the pin can also be dragged. OpenStreetMap tiles
// (their attribution is required).
export interface LocationMapProps {
  value: GeoPoint | null;
  // Where the map looks without a pin: the chosen city's centre.
  center: GeoPoint;
  onChange: (point: GeoPoint) => void;
  label: string;
}

const PIN_ZOOM = 17;
const CITY_ZOOM = 14;

// A plain SVG pin instead of Leaflet's image marker (its default icon breaks with bundlers).
const PIN_ICON = L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#f97316" stroke="#ffffff" stroke-width="1.5" style="filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.3))"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="#ffffff"/></svg>`,
  iconSize: [36, 36],
  iconAnchor: [18, 34],
});

function ClickToPlace({ onChange }: { onChange: (point: GeoPoint) => void }) {
  useMapEvents({
    click: (event) => onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
  });
  return null;
}

// Moves the view when the city changes (no pin yet) or the pin is set from outside the map
// (the "use my location" button).
function FollowView({ value, center }: { value: GeoPoint | null; center: GeoPoint }) {
  const map = useMap();
  const lat = value?.latitude ?? null;
  const lng = value?.longitude ?? null;
  useEffect(() => {
    if (lat === null || lng === null) {
      map.setView([center.latitude, center.longitude], CITY_ZOOM);
    } else if (!map.getBounds().contains([lat, lng])) {
      // A pin placed by a click is already in view, so only an outside pin moves the map.
      map.setView([lat, lng], Math.max(map.getZoom(), PIN_ZOOM - 2));
    }
  }, [map, lat, lng, center.latitude, center.longitude]);
  return null;
}

function LocationMap({ value, center, onChange, label }: LocationMapProps) {
  const { t } = useTranslation();
  const start = value ?? center;
  return (
    <div
      className="h-64 overflow-hidden rounded-xl border border-gray-200 sm:h-80"
      role="application"
      aria-label={label}
      data-testid="location-map"
    >
      <MapContainer
        center={[start.latitude, start.longitude]}
        zoom={value ? PIN_ZOOM : CITY_ZOOM}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToPlace onChange={onChange} />
        <FollowView value={value} center={center} />
        {value && (
          <Marker
            position={[value.latitude, value.longitude]}
            icon={PIN_ICON}
            draggable
            title={t("location.pinTitle")}
            eventHandlers={{
              dragend: (event) => {
                const { lat, lng } = (event.target as L.Marker).getLatLng();
                onChange({ latitude: lat, longitude: lng });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}

export default LocationMap;
