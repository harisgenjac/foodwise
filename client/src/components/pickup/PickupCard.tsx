import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  CalendarX,
  CircleCheck,
  Clock,
  MapPin,
  PackageCheck,
  Phone,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import { formatMoney, formatOrderCode, itemsSummary } from "../../utils/orders.js";
import type { Order } from "../../types/index.js";

interface PickupCardProps {
  order: Order;
  isStore: boolean;
  onComplete?: (order: Order) => void;
  onCancelOverdue?: (order: Order) => void;
}

const timeFormat: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
// "18.09." in both languages (browsers format Bosnian short dates inconsistently).
const shortDate = (date: Date) =>
  `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`;

// One handover of a whole order: the time on the left (orange, red when overdue, green once
// picked up), the order and the other party in the middle, the actions on the right.
function PickupCard({ order, isStore, onComplete, onCancelOverdue }: PickupCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const isCompleted = order.status === "Completed";
  const isOverdue = Boolean(order.is_overdue);
  const pickup = new Date(order.pickup_at);
  const pickedUpAt = new Date(order.picked_up_at ?? order.updated_at);
  const category = order.items[0]?.category;
  const image = (category && CATEGORY_IMAGES[category]) || CATEGORY_IMAGES.Other;
  const PartyIcon = isStore ? UtensilsCrossed : Store;
  const daysOverdue = order.days_overdue ?? 0;

  const tone = isCompleted
    ? "bg-green-50 text-green-700"
    : isOverdue
      ? "bg-red-50 text-red-700"
      : "bg-orange-50 text-orange-700";

  return (
    <article
      data-testid="pickup-card"
      onClick={() => navigate(`/orders/${order.id}`)}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:flex-row ${
        isOverdue ? "border-red-100" : "border-gray-100"
      }`}
    >
      <div
        className={`flex shrink-0 items-center justify-between gap-2 px-4 py-3 sm:w-36 sm:flex-col sm:justify-center sm:py-4 ${tone}`}
      >
        <div className="flex items-center gap-2 sm:flex-col sm:gap-1">
          <Clock className="h-4 w-4 opacity-70" strokeWidth={2} />
          <span className="text-2xl font-bold tracking-tight">{pickup.toLocaleTimeString(i18n.language, timeFormat)}</span>
          <span className="text-xs font-medium opacity-80">{shortDate(pickup)}</span>
        </div>
        {isOverdue && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3 w-3" />
            {daysOverdue > 0 ? t("pickups.overdueDays", { count: daysOverdue }) : t("pickups.overdueToday")}
          </span>
        )}
        {isCompleted && <CircleCheck className="h-5 w-5" strokeWidth={2} />}
      </div>

      <div className="flex min-w-0 flex-1 gap-4 p-4">
        <img
          src={image}
          alt=""
          className="h-16 w-16 shrink-0 rounded-xl object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="truncate text-base font-bold text-gray-900">
              {t("orders.title", { code: formatOrderCode(order.code) })}
            </h3>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">{itemsSummary(order, t)}</span>
              {" · "}
              {t("pickups.total")} <span className="font-semibold text-green-700">{formatMoney(order.total)}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <PartyIcon className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate font-medium text-gray-800">{order.business_name}</span>
              {order.city && <span className="text-gray-400">· {order.city}</span>}
            </span>
            {order.party_phone && (
              <a
                href={`tel:${order.party_phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 font-medium text-orange-700 hover:underline"
              >
                <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                {order.party_phone}
              </a>
            )}
            {!isStore && order.party_address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                {order.party_address}
              </span>
            )}
            {!isStore && order.party_pickup_hours && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                {t("pickups.pickupHours")}: {order.party_pickup_hours}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-gray-100 p-4 sm:w-56 sm:flex-col sm:items-stretch sm:justify-center sm:border-t-0 sm:border-l">
        {isCompleted ? (
          <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            <PackageCheck className="h-4 w-4" />
            {t("pickups.pickedUpAt", {
              date: `${shortDate(pickedUpAt)} ${pickedUpAt.toLocaleTimeString(i18n.language, timeFormat)}`,
            })}
          </span>
        ) : isStore ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onComplete?.(order);
              }}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-600/20 transition-colors hover:bg-green-700"
            >
              <PackageCheck className="h-4 w-4" />
              {t("pickups.completeButton")}
            </button>
            {isOverdue && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelOverdue?.(order);
                }}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <CalendarX className="h-4 w-4" />
                {t("pickups.cancelOverdueButton")}
              </button>
            )}
          </>
        ) : (
          !isOverdue && (
            <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
              <CircleCheck className="h-4 w-4" />
              {t("pickups.readyForPickup")}
            </span>
          )
        )}
        <Link
          to={`/orders/${order.id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-50"
        >
          {t("pickups.details")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export default PickupCard;
