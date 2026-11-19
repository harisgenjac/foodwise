import { useCallback, useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Store } from "lucide-react";
import StoreAvatar from "../store/StoreAvatar.js";
import type { User } from "../../types/index.js";

const SKELETON_CARDS = 6;
// The arrows scroll by about two cards.
const CARDS_PER_STEP = 2;

// Every card, the skeletons and "All stores" too: 120 px wide on phones, 140 px from sm up.
const CARD = "flex w-[120px] flex-none snap-start flex-col items-center rounded-xl border px-2.5 py-4 text-center sm:w-[140px]";
const STORE_CARD = `${CARD} border-[#E7E5E4] bg-white`;

interface StoreCarouselProps {
  // The nearest stores (GET /users/stores?radius=all&limit=20); null while loading.
  stores: User[] | null;
}

// "Stores near you" on the restaurant dashboard (design/restaurant-home/stores-carousel.html):
// a horizontal track with scroll snap and no visible scrollbar (swipe on touch screens), round
// previous/next buttons from md up (each hidden when the track cannot scroll that way), and an
// "All stores" card at the end. Skeleton cards while loading; the parent leaves the section out
// when there are no stores.
function StoreCarousel({ stores }: StoreCarouselProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const trackId = useId();
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });

  const updateArrows = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScroll({
      back: track.scrollLeft > 1,
      forward: track.scrollLeft + track.clientWidth < track.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    updateArrows();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateArrows);
    observer.observe(track);
    return () => observer.disconnect();
  }, [stores, updateArrows]);

  const scrollByCards = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = track?.querySelector("li");
    if (!track || !card) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    track.scrollBy({ left: direction * CARDS_PER_STEP * (card.getBoundingClientRect().width + gap), behavior: "smooth" });
  };

  // Keyboard focus brings the card fully into view inside the track.
  const revealFocused = (event: FocusEvent<HTMLElement>) =>
    event.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" });

  const arrow =
    "hidden h-9 w-9 items-center justify-center rounded-full border border-[#D6D3D1] bg-white text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]";

  return (
    <section aria-labelledby={titleId} aria-busy={!stores} data-testid="store-carousel">
      <div className="mb-3 flex items-center justify-between">
        <h2 id={titleId} className="text-lg font-semibold text-[#1C1917]">
          {t("storeCarousel.title")}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label={t("storeCarousel.previous")}
            aria-controls={trackId}
            onClick={() => scrollByCards(-1)}
            className={`${arrow} ${canScroll.back ? "md:flex" : ""}`}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t("storeCarousel.next")}
            aria-controls={trackId}
            onClick={() => scrollByCards(1)}
            className={`${arrow} ${canScroll.forward ? "md:flex" : ""}`}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <ul
        id={trackId}
        ref={trackRef}
        onScroll={updateArrows}
        data-testid="store-carousel-track"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {stores === null
          ? Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <li key={index} aria-hidden="true" data-testid="store-card-skeleton" className={STORE_CARD}>
                <span className="mb-2.5 h-16 w-16 animate-pulse rounded-full bg-gray-200" />
                <span className="h-4 w-20 animate-pulse rounded bg-gray-200" />
                <span className="mt-2 h-3 w-10 animate-pulse rounded bg-gray-100" />
              </li>
            ))
          : stores.map((store) => (
              <li key={store.id} className="flex flex-none snap-start">
                <Link
                  to={`/stores/${store.id}`}
                  onFocus={revealFocused}
                  data-testid="store-card"
                  className={`${STORE_CARD} transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]`}
                >
                  <StoreAvatar store={store} decorative className="mb-2.5 h-16 w-16 rounded-full text-xl" />
                  {/* Block elements, so the link's name reads "name, distance" with a pause between. */}
                  <div className="line-clamp-2 h-[36px] text-sm leading-[1.3] break-words text-[#1C1917]">
                    {store.business_name}
                  </div>
                  {store.distance_km != null && (
                    <div className="mt-1 text-xs text-[#78716C]">
                      {t("storeCarousel.distance", { km: store.distance_km })}
                    </div>
                  )}
                </Link>
              </li>
            ))}
        {stores !== null && (
          <li className="flex flex-none snap-start">
            <Link
              to="/stores"
              onFocus={revealFocused}
              data-testid="store-card-all"
              className={`${CARD} justify-center gap-1.5 border-dashed border-[#5EEAD4] bg-[#F0FDFA] text-sm text-[#0F766E] hover:bg-[#CCFBF1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]`}
            >
              <Store className="h-6 w-6" aria-hidden="true" />
              {t("storeCarousel.allStores")}
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

export default StoreCarousel;
