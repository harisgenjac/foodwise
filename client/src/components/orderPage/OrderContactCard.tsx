import { useId, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Bike, Car, Phone } from "lucide-react";
import StoreAvatar from "../store/StoreAvatar.js";
import { ScooterIcon } from "../dashboard/HomeIllustrations.js";
import { storeTone } from "../../utils/storeTone.js";
import { CALL_BUTTON, CARD_LINK, PAGE_CARD } from "./styles.js";
import type { CourierVehicle, OrderDetails } from "../../types/index.js";

const VEHICLE_ICONS: Record<CourierVehicle, ComponentType<{ className?: string }>> = {
  BICYCLE: Bike,
  SCOOTER: ScooterIcon,
  CAR: Car,
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

// The courier's photo (or initials while there is none, or when it fails to load) with a small
// badge of the vehicle.
function CourierAvatar({ name, photoUrl, vehicle }: { name: string; photoUrl: string | null; vehicle: CourierVehicle | null }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState<string | null>(null);
  const label = t("orderPage.contact.courierPhoto", { name });
  const VehicleIcon = vehicle ? VEHICLE_ICONS[vehicle] : null;
  return (
    <span className="relative h-12 w-12 shrink-0">
      {photoUrl && failed !== photoUrl ? (
        <img
          src={photoUrl}
          alt={label}
          onError={() => setFailed(photoUrl)}
          data-testid="courier-photo"
          className="h-12 w-12 rounded-full object-cover"
        />
      ) : (
        <span
          role="img"
          aria-label={label}
          data-testid="courier-initials"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-info-100 text-[15px] font-extrabold text-info-900"
        >
          {initials(name)}
        </span>
      )}
      {VehicleIcon && (
        <span
          aria-hidden="true"
          data-testid="courier-vehicle"
          className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-info-700 text-white"
        >
          <VehicleIcon className="h-3.5 w-3.5" />
        </span>
      )}
    </span>
  );
}

interface OrderContactCardProps {
  order: OrderDetails;
  // Opens the problem report; hidden once the order can no longer be reported.
  onReport?: () => void;
}

// "Kontakt" (design/order-details/): the store (logo, the name linking to its page, the address, a
// call button), the courier once one is assigned to a delivery (photo or initials with the vehicle,
// the name linking to the delivery service's tracking page, "Kurir · Skuter · phone", a call
// button) and "Prijavi problem".
function OrderContactCard({ order, onReport }: OrderContactCardProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const store = order.store;
  const storeName = store.business_name ?? "";
  const tone = storeTone(order.store_id);
  const delivery = order.fulfilment_method === "DELIVERY" ? order.delivery : null;
  const courierName = delivery?.courier_name ?? null;

  return (
    <section
      aria-labelledby={titleId}
      data-testid="order-contact"
      className={`${PAGE_CARD} flex min-w-0 flex-[2_1_280px] flex-col gap-3 px-5 py-5 sm:px-6`}
    >
      <h2 id={titleId} className="text-lg font-extrabold text-neutral-900">
        {t("orderPage.contact.title")}
      </h2>

      <div data-testid="contact-store" className="flex items-center gap-3">
        <StoreAvatar
          store={{ business_name: storeName, logo_url: store.logo_url ?? undefined }}
          decorative
          frameClassName="font-extrabold"
          style={{ backgroundColor: tone.soft, color: tone.strong }}
          className="h-11 w-11 rounded-[14px] text-[15px]"
        />
        <div className="min-w-0 flex-1">
          <Link to={`/stores/${order.store_id}`} className={`${CARD_LINK} text-[15px] font-extrabold break-words text-brand-800`}>
            {storeName}
          </Link>
          {(store.address || store.city) && (
            <p className="text-xs text-neutral-600">{[store.address, store.city].filter(Boolean).join(", ")}</p>
          )}
        </div>
        {store.phone && (
          <a href={`tel:${store.phone}`} aria-label={t("orderPage.contact.callStore", { name: storeName })} className={CALL_BUTTON}>
            <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
          </a>
        )}
      </div>

      {delivery && courierName && (
        <div data-testid="contact-courier" className="flex items-center gap-3 border-t border-[#EEEDEB] pt-3">
          <CourierAvatar name={courierName} photoUrl={delivery.courier_photo_url ?? null} vehicle={delivery.courier_vehicle ?? null} />
          <div className="min-w-0 flex-1">
            {delivery.tracking_url ? (
              <a
                href={delivery.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${CARD_LINK} text-[15px] font-extrabold break-words text-brand-800`}
              >
                {courierName}
                <span className="sr-only"> ({t("orderPage.contact.tracking")})</span>
              </a>
            ) : (
              <p className="text-[15px] font-extrabold break-words text-neutral-900">{courierName}</p>
            )}
            <p className="text-xs text-neutral-600">
              {[
                t("orderPage.contact.courier"),
                delivery.courier_vehicle ? t(`orders.delivery.vehicles.${delivery.courier_vehicle}`) : null,
                delivery.courier_phone,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {delivery.courier_phone && (
            <a
              href={`tel:${delivery.courier_phone}`}
              aria-label={t("orderPage.contact.callCourier", { name: courierName })}
              className={CALL_BUTTON}
            >
              <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {onReport && (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={onReport}
          className="mt-1 inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white text-sm font-bold text-neutral-700 transition-colors hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {t("orderPage.problem.open")}
        </button>
      )}
    </section>
  );
}

export default OrderContactCard;
