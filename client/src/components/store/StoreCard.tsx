import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Clock, MapPin, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import StoreAvatar from "./StoreAvatar.js";
import FavoriteButton from "./FavoriteButton.js";
import type { User } from "../../types/index.js";

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
    { icon: Clock, value: store.opening_hours },
    { icon: Phone, value: store.phone },
  ];

  return (
    <div
      onClick={() => navigate(`/stores/${store.id}`)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative h-20 bg-linear-to-br from-orange-50 via-amber-50/60 to-white">
        <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-orange-200/30 blur-2xl" />
        <div className="absolute top-3 right-3">
          <FavoriteButton isFavorite={isFavorite} onToggle={onToggleFavorite} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        <StoreAvatar store={store} className="-mt-9 h-16 w-16 rounded-2xl text-xl" />

        <div>
          <h3 className="line-clamp-1 text-lg font-bold text-gray-800">{store.business_name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {store.city && (
              <span className="inline-flex items-center gap-1 text-gray-500">
                <MapPin className="h-3.5 w-3.5" />
                {store.city}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                activeProducts > 0 ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {activeProducts > 0
                ? t("store.activeOffers", { count: activeProducts })
                : t("store.noOffers")}
            </span>
          </div>
        </div>

        <p className="line-clamp-2 text-sm text-gray-500">
          {store.description || t("store.noDescription")}
        </p>

        <ul className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 text-sm">
          {contacts.map(({ icon: Icon, value }, index) => (
            <li key={index} className="flex items-center gap-2 text-gray-700">
              <Icon className="h-4 w-4 shrink-0 text-orange-500" strokeWidth={1.8} />
              <span className="truncate">{value || "—"}</span>
            </li>
          ))}
        </ul>

        <Link
          to={`/stores/${store.id}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
        >
          {t("store.viewOffer")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export default StoreCard;
