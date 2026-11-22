import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Clock, MapPin, Phone, ShoppingBag, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import StoreAvatar from "../store/StoreAvatar.js";
import StoreKindChip from "../store/StoreKindChip.js";
import FavoriteButton from "../store/FavoriteButton.js";
import WeekHoursPopover from "./WeekHoursPopover.js";
import { formatKmDistance } from "../../utils/radius.js";
import { hoursRange, openState, openStateDetail, openStateText } from "../../utils/storeHours.js";
import { todayWeekday, type Schedule } from "../../utils/schedule.js";
import { formatPauseEnd, isPaused } from "../../utils/orderPause.js";
import { storeTone } from "../../utils/storeTone.js";
import type { User } from "../../types/index.js";

interface StoreHeaderCardProps {
  store: User;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// One column of the info row: an icon, a label, the main value and a line under it. `min-w-0`
// lets long values truncate instead of widening the card.
function InfoItem({ icon: Icon, label, value, line, testId }: { icon: LucideIcon; label: string; value: ReactNode; line?: ReactNode; testId: string }) {
  return (
    <div data-testid={testId} className="flex min-w-0 gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-800">
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-neutral-600">{label}</p>
        <div className="mt-0.5 text-[15px] font-bold text-neutral-900">{value}</div>
        {line && <div className="mt-0.5 text-[13px] text-neutral-600">{line}</div>}
      </div>
    </div>
  );
}

// Today's hours as the main value and "Danas · Cijela sedmica" under it; on a closed day "Danas
// zatvoreno" and when it opens next. "—" without weekly hours.
function hoursItem(schedule: Schedule | null | undefined, title: string, t: TFunction) {
  if (!schedule) return { value: "—", line: <span>{t("storePage.notEntered")}</span> };
  const today = schedule[todayWeekday()];
  if (today) {
    return {
      value: <span className="tabular-nums">{hoursRange(today)}</span>,
      line: (
        <span>
          <span className="font-bold text-brand-800">{t("storePage.today")}</span> · <WeekHoursPopover schedule={schedule} title={title} />
        </span>
      ),
    };
  }
  const state = openState(schedule);
  const next = state ? openStateDetail(state, t) : "";
  return {
    value: t("storePage.closedToday"),
    line: (
      <span>
        {next && <>{capitalize(next)} · </>}
        <WeekHoursPopover schedule={schedule} title={title} />
      </span>
    ),
  };
}

// The store page's header (design/stores/store-products.html): the logo or initials, the name, the
// open-state chip, a branch's chain chip, the description and the favourite pill; under it the info
// row in five equal columns (two on tablets, stacked on phones): address with the city and the
// distance, today's opening hours and pickup hours with the week popover, delivery with the
// preparation time (or the order pause in orange) and the contact phone and email.
function StoreHeaderCard({ store, isFavorite, onToggleFavorite }: StoreHeaderCardProps) {
  const { t, i18n } = useTranslation();
  const tone = storeTone(store.id);
  const state = openState(store.opening_schedule);
  const opening = hoursItem(store.opening_schedule, t("storePage.workingHours"), t);
  const pickup = hoursItem(store.pickup_schedule, t("storePage.pickup"), t);
  const paused = isPaused(store);
  const distance =
    store.distance_km !== null && store.distance_km !== undefined ? formatKmDistance(store.distance_km, i18n.language) : null;
  const place = store.city
    ? distance
      ? t("storePage.cityDistance", { city: store.city, distance })
      : store.city
    : null;

  return (
    <section
      aria-labelledby="store-name"
      className="rounded-[20px] border border-[#EEEDEB] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04),0_4px_16px_rgba(28,25,23,0.04)]"
    >
      <div className="flex flex-wrap items-start gap-5 p-5 sm:p-6">
        <StoreAvatar
          store={store}
          frameClassName="font-extrabold tracking-[-0.02em]"
          style={{ backgroundColor: tone.soft, color: tone.strong }}
          className="h-[72px] w-[72px] rounded-[20px] text-2xl sm:h-[88px] sm:w-[88px] sm:rounded-[22px] sm:text-[30px]"
        />
        <div className="min-w-0 flex-[1_1_260px]">
          <div className="flex flex-wrap items-center gap-3">
            <h1 id="store-name" className="min-w-0 text-2xl font-extrabold tracking-[-0.02em] break-words text-neutral-900 sm:text-[28px]">
              {store.business_name}
            </h1>
            {state && (
              <span
                data-testid="store-open-state"
                className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold ${
                  state.open ? "bg-brand-100 text-brand-800" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${state.open ? "bg-brand-800" : "bg-neutral-500"}`} aria-hidden="true" />
                {openStateText(state, t)}
              </span>
            )}
          </div>
          {store.company_name && <StoreKindChip company={store.company_name} className="mt-2" />}
          <p className="mt-2 max-w-[640px] text-[15px] leading-[1.55] text-neutral-600">{store.description || t("store.noDescription")}</p>
        </div>
        <FavoriteButton isFavorite={isFavorite} onToggle={onToggleFavorite} variant="pill" />
      </div>

      <div className="grid grid-cols-1 gap-5 border-t border-[#EEEDEB] px-5 pt-5 pb-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
        <InfoItem
          testId="info-address"
          icon={MapPin}
          label={t("storePage.address")}
          value={<span className="block break-words">{store.address || "—"}</span>}
          line={place}
        />
        <InfoItem testId="info-hours" icon={Clock} label={t("storePage.workingHours")} value={opening.value} line={opening.line} />
        <InfoItem testId="info-pickup" icon={ShoppingBag} label={t("storePage.pickup")} value={pickup.value} line={pickup.line} />
        <InfoItem
          testId="info-delivery"
          icon={Truck}
          label={t("storePage.delivery")}
          value={store.delivery_enabled ? t("storePage.offersDelivery") : t("storePage.noDelivery")}
          line={
            paused ? (
              <span className="font-bold text-accent-700">
                {t("storePage.paused", { until: formatPauseEnd(store.orders_paused_until ?? null, t) })}
              </span>
            ) : store.preparation_minutes ? (
              t("storePage.preparation", { minutes: store.preparation_minutes })
            ) : null
          }
        />
        <InfoItem
          testId="info-contact"
          icon={Phone}
          label={t("storePage.contact")}
          value={
            store.phone ? (
              <a href={`tel:${store.phone}`} title={store.phone} className="block truncate hover:text-brand-800 hover:underline">
                {store.phone}
              </a>
            ) : (
              "—"
            )
          }
          line={
            store.email && (
              <a
                href={`mailto:${store.email}`}
                title={store.email}
                data-testid="store-email"
                className="block truncate hover:text-brand-800 hover:underline"
              >
                {store.email}
              </a>
            )
          }
        />
      </div>
    </section>
  );
}

export default StoreHeaderCard;
