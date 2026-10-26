import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import { RESERVATION_STATUS_STYLES } from "../../utils/reservationStatus.js";
import type { Reservation } from "../../types/index.js";

interface ReservationHistoryRowProps {
  reservation: Reservation;
}

// One compact row of the restaurant's reservation history; the whole row opens the reservation.
// On phones it stacks into two lines (product and store, then time, quantity, total and status).
function ReservationHistoryRow({ reservation }: ReservationHistoryRowProps) {
  const { t, i18n } = useTranslation();
  const reservationStatuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const image = (reservation.category && CATEGORY_IMAGES[reservation.category]) || CATEGORY_IMAGES.Other;
  const total = Number(reservation.discounted_price ?? 0) * Number(reservation.quantity);
  const time = new Date(reservation.created_at).toLocaleTimeString(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return (
    <Link
      to={`/reservation/${reservation.id}`}
      className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-orange-50/50 focus-visible:bg-orange-50 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-800">{reservation.product_name}</p>
          <p className="truncate text-sm text-gray-500">
            {reservation.business_name}
            {reservation.city && ` · ${reservation.city}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-13 text-sm sm:pl-0">
        <time dateTime={reservation.created_at} className="text-gray-500 tabular-nums">
          {time}
        </time>
        <span className="text-gray-700">
          {parseFloat(reservation.quantity)} {reservation.unit && (units[reservation.unit] || reservation.unit)}
        </span>
        <span className="font-semibold text-gray-800 tabular-nums">{total.toFixed(2)} KM</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RESERVATION_STATUS_STYLES[reservation.status]}`}
        >
          {reservationStatuses[reservation.status] || reservation.status}
        </span>
        <ChevronRight className="ml-auto hidden h-4 w-4 text-gray-300 transition-colors group-hover:text-orange-500 sm:block" />
      </div>
    </Link>
  );
}

export default ReservationHistoryRow;
