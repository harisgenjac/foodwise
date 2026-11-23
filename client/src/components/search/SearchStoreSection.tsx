import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Clock, MapPin, PauseCircle } from "lucide-react";
import StoreAvatar from "../store/StoreAvatar.js";
import StoreKindChip from "../store/StoreKindChip.js";
import CartOfferCard, { type CartActions } from "../storePage/CartOfferCard.js";
import ProductTrack from "../storePage/ProductTrack.js";
import { formatKmDistance } from "../../utils/radius.js";
import { formatPauseEnd, isPaused } from "../../utils/orderPause.js";
import { openStateText, serverOpenState } from "../../utils/storeHours.js";
import { storeTone } from "../../utils/storeTone.js";
import type { SearchStore } from "../../types/index.js";

// Search's card widths: one and a bit on narrow phones, two from 440 px, three on large phones and
// small tablets (no sidebar yet), two again next to the sidebar (md), four from lg up (20 px gaps).
const SEARCH_ITEM =
  "w-[78%] min-[440px]:w-[calc(50%-10px)] sm:w-[calc((100%-40px)/3)] md:w-[calc(50%-10px)] lg:w-[calc(25%-15px)]";

const chip = "inline-flex h-6 max-w-full min-w-0 items-center gap-[5px] rounded-full px-2.5 text-xs font-bold";

// One store on Search (design/search/search.html): a white card with the logo or initials on the
// store's tone, the name (a link to the store page), the distance and city, the chain or
// "independent" chip, "Sve (N)" to the store page, then every matching offer (a slider with more
// than four). A store that takes no orders right now (orders paused, or closed by its weekly
// hours) says so in a chip; its cards turn grayscale and their "+" is disabled.
function SearchStoreSection({ store, cart }: { store: SearchStore; cart: CartActions }) {
  const { t, i18n } = useTranslation();
  const tone = storeTone(store.id);
  const paused = isPaused(store);
  const openState = serverOpenState(store);
  const closed = openState !== null && !openState.open;
  const headingId = `search-store-${store.id}`;
  const place = [
    store.distance_km !== null ? formatKmDistance(store.distance_km, i18n.language) : null,
    store.city,
  ].filter(Boolean).join(" · ");

  return (
    <section
      data-testid="search-store"
      aria-labelledby={headingId}
      className="flex flex-col gap-[18px] overflow-hidden rounded-[20px] border border-[#EEEDEB] bg-white px-4 pt-5 pb-6 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_4px_16px_rgba(28,25,23,0.04)] sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-3.5">
        <StoreAvatar
          store={{ business_name: store.business_name, logo_url: store.logo_url ?? undefined }}
          decorative
          frameClassName="font-extrabold"
          style={{ backgroundColor: tone.soft, color: tone.strong }}
          className="h-[52px] w-[52px] rounded-2xl text-lg"
        />
        <div className="min-w-0 flex-[1_1_220px]">
          <h2 id={headingId} className="text-lg font-extrabold tracking-[-0.01em] text-neutral-900">
            <Link
              to={`/stores/${store.id}`}
              className="rounded-sm hover:text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
            >
              {store.business_name}
            </Link>
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-neutral-600">
            {place && (
              <span className="inline-flex items-center gap-1" data-testid="search-store-place">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {place}
              </span>
            )}
            <StoreKindChip company={store.company_name} />
            {paused && (
              <span data-testid="search-store-paused" className={`${chip} bg-accent-100 text-accent-700`}>
                <PauseCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {t("storePage.paused", { until: formatPauseEnd(store.orders_paused_until, t) })}
                </span>
              </span>
            )}
            {closed && (
              <span data-testid="search-store-closed" className={`${chip} bg-neutral-100 text-neutral-700`}>
                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{openStateText(openState, t)}</span>
              </span>
            )}
          </div>
        </div>
        <Link
          to={`/stores/${store.id}`}
          aria-label={t("search.seeAllLabel", { count: store.match_count, store: store.business_name })}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-brand-800 px-[18px] text-sm font-bold text-brand-800 hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300"
        >
          {t("search.seeAll", { count: store.match_count })}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <ProductTrack
        products={store.products}
        itemClassName={SEARCH_ITEM}
        renderCard={(product) => <CartOfferCard product={product} cart={cart} unavailable={paused || closed} />}
      />
    </section>
  );
}

export default SearchStoreSection;
