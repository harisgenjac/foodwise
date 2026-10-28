import type { SelectHTMLAttributes } from "react";
import { useCities } from "../../hooks/useCities.js";

interface CitySelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> {
  // The selected city id as a string; "" = none (in a filter: all cities).
  value: string;
  onChange: (cityId: string) => void;
  // The text of the empty option: "Choose a city" in a form, "-- All cities --" in a filter.
  emptyLabel: string;
}

// A city from the fixed list (GET /cities, loaded once per session), in the server's order.
// Other props (className, aria-*, onBlur) go to the <select>, so FormField can add its error
// style and links, and FilterField its icon spacing.
function CitySelect({ value, onChange, emptyLabel, ...selectProps }: CitySelectProps) {
  const { cities } = useCities();

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} {...selectProps}>
      <option value="">{emptyLabel}</option>
      {cities.map((city) => (
        <option key={city.id} value={String(city.id)}>
          {city.name}
        </option>
      ))}
    </select>
  );
}

export default CitySelect;
