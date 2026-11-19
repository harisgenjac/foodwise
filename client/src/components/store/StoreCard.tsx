import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Clock, MapPin, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import StoreAvatar from "./StoreAvatar.js";
import FavoriteButton from "./FavoriteButton.js";
import ChainLabel from "./ChainLabel.js";
import { formatCityDistance } from "../../utils/radius.js";
import type { User } from "../../types/index.js";
import { hoursText } from "../../utils/schedule.js";
import StorePausedNotice from "./StorePausedNotice.js";

interface StoreCardProps {
  store: User;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

function StoreCard({ store, isFavorite, onToggleFavorite }: StoreCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeProducts = parseInt(store.active_products ?? "0", 10);
  const contacts: { icon: LucideIcon; value: string | undefined }[] = [
    { icon: MapPin, value: store.address },
    { icon: Clock, value: hoursText(store.opening_schedule, t) ?? undefined },
    { icon: Phone, value: store.phone },
  ];

  return (
    <div
      onClick={() => navigate(`/stores/${store.id}`)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative h-20 bg-linear-to-br from-brand-50 via-warning-50/60 to-white">
        <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-brand-200/30 blur-2xl" />
        <div className="absolute top-3 right-3">
          <FavoriteButton isFavorite={isFavorite} onToggle={onToggleFavorite} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        <StoreAvatar store={store} className="relative z-10 -mt-9 h-16 w-16 rounded-2xl text-xl" />

        <div>
          <h3 className="line-clamp-1 text-lg font-bold text-neutral-800">{store.business_name}</h3>
          <ChainLabel company={store.company_name} className="mt-1 max-w-full" />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {store.city && (
              <span className="inline-flex items-center gap-1 text-neutral-500">
                <MapPin className="h-3.5 w-3.5" />
                {formatCityDistance(t, store.city, store.distance_km)}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                activeProducts > 0 ? "bg-brand-50 text-brand-800" : "bg-neutral-100 text-neutral-500"
              }`}
            >
              {activeProducts > 0
                ? t("store.activeOffers", { count: activeProducts })
                : t("store.noOffers")}
            </span>
            <StorePausedNotice pause={store} variant="badge" />
          </div>
        </div>

        <p className="line-clamp-2 text-sm text-neutral-500">
          {store.description || t("store.noDescription")}
        </p>

        <ul className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3 text-sm">
          {contacts.map(({ icon: Icon, value }, index) => (
            <li key={index} className="flex items-center gap-2 text-neutral-700">
              <Icon className="h-4 w-4 shrink-0 text-brand-800" strokeWidth={1.8} />
              <span className="truncate">{value || "—"}</span>
            </li>
          ))}
        </ul>

        <Link
          to={`/stores/${store.id}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-50 py-2.5 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-900 hover:text-white"
        >
          {t("store.viewOffer")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export default StoreCard;
