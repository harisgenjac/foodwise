import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Clock, MapPin, Navigation, PauseCircle, Phone } from "lucide-react";
import StoreAvatar from "./StoreAvatar.js";
import FavoriteButton from "./FavoriteButton.js";
import StoreKindChip from "./StoreKindChip.js";
import { formatKmDistance } from "../../utils/radius.js";
import { openState, openStateDetail } from "../../utils/storeHours.js";
import { formatPauseEnd, isPaused } from "../../utils/orderPause.js";
import { storeTone } from "../../utils/storeTone.js";
import type { User } from "../../types/index.js";

interface StoreCardProps {
  store: User;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

// A store on the store list (design/stores/stores-list.html): the logo or initials on the store's
// tone, the favourite heart, the name (a link stretched over the whole card, so the card opens the
// store page; the heart sits above it), the chain or "independent" chip, the distance, the offer
// count and the biggest discount, the description (two lines), a box with the address, the open
// state and the phone (and the order pause while there is one), and "Pogledaj ponudu →".
function StoreCard({ store, isFavorite, onToggleFavorite }: StoreCardProps) {
  const { t, i18n } = useTranslation();
  const offers = parseInt(store.active_products ?? "0", 10);
  const tone = storeTone(store.id);
  const state = openState(store.opening_schedule);
  const distance =
    store.distance_km !== null && store.distance_km !== undefined
      ? formatKmDistance(store.distance_km, i18n.language)
      : store.city;

  return (
    <article
      data-testid="store-card"
      className="group relative flex flex-col gap-3 rounded-[20px] border border-[#EEEDEB] bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_4px_16px_rgba(28,25,23,0.04)] transition hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] has-[a:focus-visible]:outline-[3px] has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-brand-300"
    >
      <div className="flex items-start justify-between">
        <StoreAvatar
          store={store}
          decorative
          frameClassName="font-extrabold"
          style={{ backgroundColor: tone.soft, color: tone.strong }}
          className="h-14 w-14 rounded-2xl text-xl"
        />
        <FavoriteButton isFavorite={isFavorite} onToggle={onToggleFavorite} />
      </div>

      <div className="min-w-0">
        <h2 className="text-lg font-extrabold tracking-[-0.01em] text-neutral-900">
          <Link to={`/stores/${store.id}`} className="outline-none after:absolute after:inset-0 after:rounded-[20px] after:content-['']">
            {store.business_name}
          </Link>
        </h2>
        <StoreKindChip company={store.company_name} className="mt-1.5" />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-neutral-600">
          {distance && (
            <span className="inline-flex items-center gap-1" data-testid="store-card-distance">
              <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
              {distance}
            </span>
          )}
          {offers > 0 ? (
            <>
              <span className="inline-flex h-6 items-center rounded-full bg-brand-100 px-2.5 text-xs font-bold text-brand-800">
                {t("store.activeOffers", { count: offers })}
              </span>
              {(store.max_discount ?? 0) > 0 && (
                <span
                  data-testid="store-card-discount"
                  className="inline-flex h-6 items-center rounded-full bg-accent-100 px-2.5 text-xs font-extrabold text-accent-700"
                >
                  {t("store.upToDiscount", { percent: store.max_discount })}
                </span>
              )}
            </>
          ) : (
            <span className="inline-flex h-6 items-center rounded-full bg-neutral-100 px-2.5 text-xs font-bold text-neutral-600">
              {t("store.noOffers")}
            </span>
          )}
        </div>
      </div>

      <p className="line-clamp-2 text-sm leading-[1.55] text-neutral-600">{store.description || t("store.noDescription")}</p>

      <ul className="mt-auto flex flex-col gap-2 rounded-[14px] bg-neutral-50 px-4 py-3.5 text-sm text-neutral-900">
        <li className="flex min-w-0 items-center gap-2.5">
          <MapPin className="h-[18px] w-[18px] shrink-0 text-brand-800" aria-hidden="true" />
          <span className="truncate">{store.address || "—"}</span>
        </li>
        {state && (
          <li className="flex min-w-0 items-center gap-2.5" data-testid="store-card-open">
            <Clock className={`h-[18px] w-[18px] shrink-0 ${state.open ? "text-brand-800" : "text-neutral-600"}`} aria-hidden="true" />
            <span className="truncate">
              <strong className={`font-bold ${state.open ? "text-brand-800" : "text-neutral-600"}`}>
                {state.open ? t("storeHours.open") : t("storeHours.closed")}
              </strong>
              {openStateDetail(state, t) && <span className="text-neutral-600"> · {openStateDetail(state, t)}</span>}
            </span>
          </li>
        )}
        <li className="flex min-w-0 items-center gap-2.5">
          <Phone className="h-[18px] w-[18px] shrink-0 text-brand-800" aria-hidden="true" />
          <span className="truncate">{store.phone || "—"}</span>
        </li>
        {isPaused(store) && (
          <li className="flex min-w-0 items-center gap-2.5 font-semibold text-accent-700">
            <PauseCircle className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="truncate">
              {t("store.page.ordersPausedUntil", { until: formatPauseEnd(store.orders_paused_until ?? null, t) })}
            </span>
          </li>
        )}
      </ul>

      {/* Part of the card's link (the name is stretched over the card), so not a second link. */}
      <span
        aria-hidden="true"
        className="flex h-11 items-center justify-center gap-2 rounded-full bg-brand-50 text-sm font-bold text-brand-800 group-hover:bg-brand-100"
      >
        {t("store.viewOffer")}
        <ArrowRight className="h-4 w-4" />
      </span>
    </article>
  );
}

export default StoreCard;
