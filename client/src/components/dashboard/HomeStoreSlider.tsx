import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DragCarousel from "../common/DragCarousel.js";
import StoreAvatar from "../store/StoreAvatar.js";
import { storeTone } from "../../utils/storeTone.js";
import type { User } from "../../types/index.js";

const SKELETON_CARDS = 8;

const ITEM = "flex w-[140px] flex-none snap-start";
const CARD =
  "flex w-full flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-2.5 pt-[18px] pb-3.5 shadow-[0_2px_8px_rgba(28,25,23,0.04)]";

interface HomeStoreSliderProps {
  // The nearest stores (GET /users/stores?radius=all&limit=20); null while loading.
  stores: User[] | null;
}

// The store slider under the hero on the restaurant home page (design/restaurant-home/home.dc.html):
// white square cards with the store's logo (a branch without one shows its company's, which the
// server already puts in logo_url; otherwise the initials on the store's tone) and its name, each a
// link to the store page, in a DragCarousel with the lime arrows on the edges. Skeleton cards while
// loading; the parent leaves the section out when there are no stores.
function HomeStoreSlider({ stores }: HomeStoreSliderProps) {
  const { t } = useTranslation();

  return (
    <section aria-label={t("restaurantHome.stores.label")} aria-busy={!stores} data-testid="home-store-slider">
      <DragCarousel
        previousLabel={t("restaurantHome.stores.previous")}
        nextLabel={t("restaurantHome.stores.next")}
        busy={!stores}
        trackTestId="store-slider-track"
      >
        {stores === null
          ? Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <li key={index} aria-hidden="true" data-testid="store-card-skeleton" className={ITEM}>
                <span className={CARD}>
                  <span className="h-16 w-16 animate-pulse rounded-2xl bg-neutral-100" />
                  <span className="h-3.5 w-20 animate-pulse rounded bg-neutral-200" />
                </span>
              </li>
            ))
          : stores.map((store) => {
              const tone = storeTone(store.id);
              return (
                <li key={store.id} className={ITEM}>
                  <Link
                    to={`/stores/${store.id}`}
                    draggable={false}
                    data-testid="store-card"
                    className={`${CARD} text-neutral-900 transition duration-200 hover:-translate-y-[3px] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800`}
                  >
                    <StoreAvatar
                      store={store}
                      decorative
                      frameClassName="font-extrabold"
                      style={{ backgroundColor: tone.soft, color: tone.strong }}
                      className="h-16 w-16 rounded-2xl text-xl"
                    />
                    <span data-testid="store-card-name" className="line-clamp-2 text-center text-sm leading-[1.3] font-bold">
                      {store.business_name}
                    </span>
                  </Link>
                </li>
              );
            })}
      </DragCarousel>
    </section>
  );
}

export default HomeStoreSlider;
