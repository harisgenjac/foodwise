import { useTranslation } from "react-i18next";
import { Navigation } from "lucide-react";
import { FilterField } from "./FilterBar.js";
import { inputStyle } from "../form/FormField.js";
import { RADIUS_OPTIONS, type Radius } from "../../utils/radius.js";

interface RadiusSelectProps {
  value: Radius;
  onChange: (radius: Radius) => void;
}

// The "Distance" filter of the marketplace and the store list: up to 5/10/20/50 km from the
// restaurant's city, or all cities.
function RadiusSelect({ value, onChange }: RadiusSelectProps) {
  const { t } = useTranslation();

  return (
    <FilterField icon={Navigation}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Radius)}
        aria-label={t("radius.label")}
        className={inputStyle}
      >
        {RADIUS_OPTIONS.map((radius) => (
          <option key={radius} value={radius}>
            {radius === "all" ? t("radius.all") : t("radius.upTo", { km: radius })}
          </option>
        ))}
      </select>
    </FilterField>
  );
}

export default RadiusSelect;
