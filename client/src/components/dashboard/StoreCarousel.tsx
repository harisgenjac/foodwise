import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Apple,
  ArrowRight,
  Beef,
  Croissant,
  Leaf,
  MapPin,
  ShoppingBasket,
  ShoppingCart,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { assetUrl } from "../../api/axios.js";
import DragCarousel from "../common/DragCarousel.js";
import StoreAvatar from "../store/StoreAvatar.js";
import { formatNumber } from "../../utils/numbers.js";
import type { User } from "../../types/index.js";

const SKELETON_CARDS = 6;

// 170 px wide on phones, 210 px from md up; the cover 76 / 92 px.
const ITEM = "flex w-[170px] flex-none snap-start md:w-[210px]";
const CARD = "flex w-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white";
const COVER = "h-[76px] w-full md:h-[92px]";

// A store without a cover image gets a soft background with a large icon, and its initials (when
// it has no logo) on the stronger colour. The colours come from the palette (the 700/800 shades, so
// the white initials pass WCAG AA), with purple as the one extra hue.
interface Tone {
  soft: string;
  strong: string;
  icon: LucideIcon;
}
const TONES: Tone[] = [
  { soft: "#FEE2E2", strong: "#B91C1C", icon: ShoppingCart },
  { soft: "#DCFCE7", strong: "#166534", icon: Leaf },
  { soft: "#FFEDD5", strong: "#C2410C", icon: Croissant },
  { soft: "#E0F2FE", strong: "#0369A1", icon: Beef },
  { soft: "#FEF3C7", strong: "#B45309", icon: ShoppingBasket },
  { soft: "#F3E8FF", strong: "#7E22CE", icon: Apple },
];

// The same store always gets the same tone (a multiplicative hash of its id, so neighbouring ids
// differ).
export const storeTone = (id: number): Tone => TONES[(Math.imul(id, 2654435761) >>> 0) % TONES.length]!;

function StoreCard({ store }: { store: User }) {
  const { t, i18n } = useTranslation();
  const [coverFailed, setCoverFailed] = useState(false);
  const tone = storeTone(store.id);
  const ToneIcon = tone.icon;
  const offers = Number(store.active_products ?? 0);
  const distance =
    store.distance_km == null
      ? null
      : t("storeCarousel.distance", { km: formatNumber(store.distance_km, i18n.language, 1, 0) });
  const location = store.city && distance ? `${store.city} · ${distance}` : (store.city ?? distance);

  return (
    <Link
      to={`/stores/${store.id}`}
      draggable={false}
      data-testid="store-card"
      className={`${CARD} transition duration-200 hover:-translate-y-[3px] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800`}
    >
      {store.cover_url && !coverFailed ? (
        <img
          src={assetUrl(store.cover_url)}
          alt=""
          draggable={false}
          onError={() => setCoverFailed(true)}
          data-testid="store-card-cover"
          className={`${COVER} object-cover`}
        />
      ) : (
        <span
          aria-hidden="true"
          data-testid="store-card-cover"
          className={`${COVER} flex items-center justify-center`}
          style={{ backgroundColor: tone.soft, color: tone.strong }}
        >
          <ToneIcon className="h-9 w-9" strokeWidth={1.75} />
        </span>
      )}
      <div className="flex flex-col px-3.5 pb-4">
        <StoreAvatar
          store={store}
          decorative
          frameClassName="border-[3px] border-white font-semibold text-white"
          style={{ backgroundColor: tone.strong }}
          className="relative -mt-7 h-14 w-14 rounded-[14px] text-lg"
        />
        {/* Block elements, so the link's name reads "name, place, offers" with pauses between. */}
        <div data-testid="store-card-name" className="mt-2.5 mb-1 truncate text-[15px] font-semibold text-neutral-900">{store.business_name}</div>
        {location && (
          <div className="flex items-center gap-1 text-[13px] text-neutral-500">
            <MapPin className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
            <span className="truncate">{location}</span>
          </div>
        )}
        {offers > 0 && (
          <div
            data-testid="store-card-offers"
            className="mt-2.5 inline-flex items-center gap-1 self-start rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800"
          >
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            {t("storeCarousel.offers", { count: offers })}
          </div>
        )}
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <span className={CARD}>
      <span className={`${COVER} animate-pulse bg-neutral-100`} />
      <span className="flex flex-col px-3.5 pb-4">
        <span className="-mt-7 h-14 w-14 animate-pulse rounded-[14px] border-[3px] border-white bg-neutral-200" />
        <span className="mt-2.5 h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
        <span className="mt-2 h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
        <span className="mt-3 h-5 w-20 animate-pulse rounded-full bg-neutral-100" />
      </span>
    </span>
  );
}

interface StoreCarouselProps {
  // The nearest stores (GET /users/stores?radius=all&limit=20); null while loading.
  stores: User[] | null;
}

// "Stores near you" on the restaurant dashboard (design/restaurant-home/stores-carousel.html): a
// title with "Nearest first" and an "All stores" link, then a DragCarousel of store cards (cover,
// logo, name, city and distance, active offers). Skeleton cards while loading; the parent leaves
// the section out when there are no stores.
function StoreCarousel({ stores }: StoreCarouselProps) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} aria-busy={!stores} data-testid="store-carousel">
      <div className="mt-1 mb-3.5 flex items-end justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-xl font-semibold text-neutral-900">
            {t("storeCarousel.title")}
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500">{t("storeCarousel.subtitle")}</p>
        </div>
        <Link
          to="/stores"
          data-testid="store-carousel-all"
          className="inline-flex min-h-11 flex-none items-center gap-1 text-sm font-semibold text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
        >
          {t("storeCarousel.allStores")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <DragCarousel
        previousLabel={t("storeCarousel.previous")}
        nextLabel={t("storeCarousel.next")}
        arrowPositionClassName="top-[50px] md:top-[70px]"
        busy={!stores}
        trackTestId="store-carousel-track"
      >
        {stores === null
          ? Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <li key={index} aria-hidden="true" data-testid="store-card-skeleton" className={ITEM}>
                <SkeletonCard />
              </li>
            ))
          : stores.map((store) => (
              <li key={store.id} className={ITEM}>
                <StoreCard store={store} />
              </li>
            ))}
      </DragCarousel>
    </section>
  );
}

export default StoreCarousel;
