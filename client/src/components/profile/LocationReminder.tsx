import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, MapPin } from "lucide-react";
import { useAuth } from "../../context/AuthContext.js";
import { LOCATION_SECTION } from "./LocationPicker.js";

// On the store and restaurant dashboards while the business has not set its pin on the map:
// delivery will need the exact location. Gone once the pin is saved (My profile refreshes the user).
function LocationReminder() {
  const { user } = useAuth();
  const { t } = useTranslation();
  if (!user || (user.role !== "STORE" && user.role !== "RESTAURANT")) return null;
  if (user.latitude != null && user.longitude != null) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:justify-between sm:px-4 sm:py-3"
    >
      <p className="flex min-w-0 flex-1 items-center gap-2 font-medium sm:flex-none">
        <MapPin className="h-4 w-4 shrink-0" />
        {t("location.reminder")}
      </p>
      <Link
        to={`/my-profile#${LOCATION_SECTION}`}
        className="inline-flex min-h-11 max-w-[45%] shrink-0 items-center justify-center gap-1 rounded-xl border border-orange-200 bg-white px-3 text-center font-semibold leading-tight text-orange-600 hover:text-orange-700 sm:min-h-0 sm:max-w-none sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0"
      >
        {t("location.reminderLink")}
        <ArrowRight className="hidden h-4 w-4 shrink-0 sm:block" />
      </Link>
    </div>
  );
}

export default LocationReminder;
