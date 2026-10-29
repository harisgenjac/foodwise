import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import { RESERVATION_STATUS_STYLES } from "../../utils/reservationStatus.js";
import { formatRelativeTime } from "../../utils/notifications.js";
import StoreNameLink from "../store/StoreNameLink.js";
import type { Reservation } from "../../types/index.js";

interface DashboardReservationCardProps {
  reservation: Reservation;
  // Label for business_name: the restaurant on the store dashboard, the store on the restaurant dashboard.
  partyLabel: string;
  // Replaces the default "Details" link, e.g. with accept/reject or cancel buttons.
  actions?: ReactNode;
  // Shows when the reservation was made ("5 min ago", the date after a week); My reservations only.
  showCreatedAt?: boolean;
  // Links the store name to its profile; restaurant side only, and not on that store's own page.
  linkStore?: boolean;
}

function DashboardReservationCard({ reservation, partyLabel, actions, showCreatedAt, linkStore = false }: DashboardReservationCardProps) {
  const { t, i18n } = useTranslation();
  const reservationStatuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const image =
    (reservation.category && CATEGORY_IMAGES[reservation.category]) || CATEGORY_IMAGES.Other;

  return (
    <div data-testid="reservation-card" className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-36 overflow-hidden">
        <img src={image} alt={reservation.product_name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/25 via-transparent to-transparent" />
        <span
          className={`absolute top-3 right-3 rounded-full px-2 py-1 text-xs font-semibold ${RESERVATION_STATUS_STYLES[reservation.status]}`}
        >
          {reservationStatuses[reservation.status] || reservation.status}
        </span>
        {reservation.is_overdue && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white">
            <AlertTriangle className="h-3 w-3" />
            {t("pickups.overdueToday")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-lg font-bold text-gray-800 line-clamp-1">{reservation.product_name}</h3>

        {reservation.description && (
          <p className="text-sm text-gray-500 line-clamp-2">{reservation.description}</p>
        )}

        <dl className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("dashboard.quantity")}</dt>
            <dd className="font-medium text-gray-800">
              {reservation.quantity} {reservation.unit && (units[reservation.unit] || reservation.unit)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{partyLabel}</dt>
            <dd className="min-w-0 truncate font-medium text-gray-800">
              {linkStore && reservation.store_id && reservation.business_name ? (
                <StoreNameLink storeId={reservation.store_id} name={reservation.business_name} className="block" />
              ) : (
                reservation.business_name
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("dashboard.city")}</dt>
            <dd className="font-medium text-gray-800">{reservation.city}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("dashboard.pickupDate")}</dt>
            <dd className="text-right font-medium text-gray-800">
              {new Date(reservation.pickup_date).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
                hourCycle: "h23",
              })}
            </dd>
          </div>
          {showCreatedAt && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">{t("reservations.createdAt")}</dt>
              <dd className="text-right font-medium text-gray-800">
                {formatRelativeTime(reservation.created_at, t, i18n.language)}
              </dd>
            </div>
          )}
        </dl>

        {actions ? (
          <div className="mt-auto flex gap-2">{actions}</div>
        ) : (
          <Link
            to={`/reservation/${reservation.id}`}
            className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
          >
            {t("dashboard.detailsButton")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default DashboardReservationCard;
