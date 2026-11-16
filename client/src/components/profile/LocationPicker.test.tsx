import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import LocationPicker from "./LocationPicker.js";
import type { GeoPoint } from "../../types/index.js";
import { t } from "../../test/utils.js";
import type { LocationMapProps } from "./LocationMap.js";

// Leaflet does not run in jsdom: the map is a stand-in that shows what it was given and places a
// pin like a click on the real map.
vi.mock("./LocationMap.js", () => ({
  default: ({ value, center, onChange, label }: LocationMapProps) => (
    <div aria-label={label}>
      <span data-testid="center">{`${center.latitude},${center.longitude}`}</span>
      <span data-testid="pin">{value ? `${value.latitude},${value.longitude}` : "none"}</span>
      <button type="button" onClick={() => onChange({ latitude: 44.2, longitude: 17.9 })}>
        map click
      </button>
    </div>
  ),
}));

function Harness({ initial = null, cityCenter = null }: { initial?: GeoPoint | null; cityCenter?: GeoPoint | null }) {
  const [value, setValue] = useState<GeoPoint | null>(initial);
  return <LocationPicker value={value} onChange={setValue} cityCenter={cityCenter} />;
}

const geolocation = (outcome: { coords: GeoPoint } | "denied") => {
  const getCurrentPosition = vi.fn((success: PositionCallback, failure?: PositionErrorCallback | null) => {
    if (outcome === "denied") failure?.({ code: 1 } as GeolocationPositionError);
    else success({ coords: outcome.coords } as GeolocationPosition);
  });
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
  return getCurrentPosition;
};

afterEach(() => {
  // jsdom has no geolocation of its own.
  delete (navigator as { geolocation?: unknown }).geolocation;
});

describe("LocationPicker", () => {
  it("says the location is missing, starts at the city and places a pin with a click", async () => {
    render(<Harness cityCenter={{ latitude: 44.5, longitude: 18.6 }} />);
    expect(screen.getByText(t("location.missing"))).toBeInTheDocument();
    expect(await screen.findByTestId("center")).toHaveTextContent("44.5,18.6");
    expect(screen.getByTestId("pin")).toHaveTextContent("none");
    expect(screen.queryByRole("button", { name: t("location.remove") })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "map click" }));
    expect(screen.getByTestId("pin")).toHaveTextContent("44.2,17.9");
    expect(screen.getByText(t("location.set"))).toBeInTheDocument();
  });

  it("starts at Sarajevo without a city and removes a pin", async () => {
    render(<Harness initial={{ latitude: 43.85, longitude: 18.41 }} />);
    expect(await screen.findByTestId("center")).toHaveTextContent("43.8563,18.4131");
    expect(screen.getByText(t("location.set"))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("location.remove") }));
    expect(screen.getByTestId("pin")).toHaveTextContent("none");
    expect(screen.getByText(t("location.missing"))).toBeInTheDocument();
  });

  it("takes the device's location", async () => {
    const getCurrentPosition = geolocation({ coords: { latitude: 43.9, longitude: 18.3 } });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: t("location.useMine") }));
    expect(getCurrentPosition).toHaveBeenCalled();
    expect(await screen.findByTestId("pin")).toHaveTextContent("43.9,18.3");
  });

  it("explains when the device's location is not available", async () => {
    geolocation("denied");
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: t("location.useMine") }));
    expect(screen.getByText(t("location.geoError"))).toBeInTheDocument();
    expect(await screen.findByTestId("pin")).toHaveTextContent("none");
  });

  it("hides the device button when the browser has no geolocation", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: t("location.useMine") })).not.toBeInTheDocument();
  });
});
