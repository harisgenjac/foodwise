import { useTranslation } from "react-i18next";
import { Navigation } from "lucide-react";
import { nextRadius, widenLabel, type Radius } from "../../utils/radius.js";

interface OutsideRadiusHintProps {
  // How many results match the other filters but lie beyond the radius (`outside_radius_count`).
  count: number;
  radius: Radius;
  kind: "offers" | "stores";
  onWiden: (radius: Radius) => void;
}

// Under the results: "3 more offers are further than 10 km." with a button for the next radius.
function OutsideRadiusHint({ count, radius, kind, onWiden }: OutsideRadiusHintProps) {
  const { t } = useTranslation();
  if (count <= 0 || radius === "all") return null;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-4 text-center sm:flex-row sm:text-left">
      <p className="flex items-center gap-2 text-sm text-gray-700">
        <Navigation className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
        {t(kind === "offers" ? "radius.moreOffers" : "radius.moreStores", { count, radius })}
      </p>
      <button
        type="button"
        onClick={() => onWiden(nextRadius(radius))}
        className="cursor-pointer rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
      >
        {widenLabel(t, radius)}
      </button>
    </div>
  );
}

export default OutsideRadiusHint;
