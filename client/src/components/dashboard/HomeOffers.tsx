import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Plus } from "lucide-react";
import AddToCartModal from "../cart/AddToCartModal.js";
import OfferCard from "./OfferCard.js";
import StoreAvatar from "../store/StoreAvatar.js";
import ChainLabel from "../store/ChainLabel.js";
import { formatNumber } from "../../utils/numbers.js";
import { storeTone } from "../../utils/storeTone.js";
import type { HomeStore, Product } from "../../types/index.js";

// The restaurant's action on an offer: a round "+" that opens the quantity dialog.
function AddButton({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={t("stepper.add", { name: product.name })}
      className="relative z-10 flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full bg-brand-800 text-white shadow-[0_4px_10px_rgba(22,101,52,0.3)] transition-colors hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
    >
      <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}

// One store's row: logo, name, city and distance, the chain chip, "All (N) →" to the store page,
// and its offers that expire soonest.
function StoreRow({ store, onAdd }: { store: HomeStore; onAdd: (product: Product) => void }) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const distance =
    store.distance_km == null ? null : t("restaurantHome.offers.distance", { km: formatNumber(store.distance_km, i18n.language, 1) });
  const location = [store.city, distance].filter(Boolean).join(" · ");

  return (
    <article
      aria-labelledby={titleId}
      data-testid="home-store-row"
      // No card of its own: the store line and its offers sit on the page, a thin line above every
      // store after the first.
      className="flex flex-col gap-4 border-t border-neutral-200 pt-8 first-of-type:border-t-0 first-of-type:pt-0"
    >
      <header className="flex flex-wrap items-center gap-3.5">
        <StoreAvatar
          store={{ business_name: store.business_name, logo_url: store.logo_url ?? undefined }}
          decorative
          frameClassName="font-extrabold text-white"
          style={{ backgroundColor: storeTone(store.id).strong }}
          className="h-[52px] w-[52px] rounded-[14px] text-lg"
        />
        <div className="min-w-0 flex-[1_1_200px] leading-[1.35]">
          <h3 id={titleId} className="text-lg font-extrabold">
            {store.business_name}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
            {location && <span>{location}</span>}
            <ChainLabel company={store.company_name} className="bg-brand-100 font-bold" />
          </div>
        </div>
        <Link
          to={`/stores/${store.id}`}
          aria-label={t("restaurantHome.offers.allLabel", { store: store.business_name, count: store.offer_count })}
          className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-bold text-brand-800 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
        >
          {t("restaurantHome.offers.all", { count: store.offer_count })}
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
        </Link>
      </header>
      {/* Four columns where they fit (220 px or more each), two on narrow screens, one on phones. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-[18px] @min-[460px]:grid-cols-2 @min-[940px]:grid-cols-4">
          {store.products.map((product) => (
            <OfferCard key={product.id} product={product} action={<AddButton product={product} onAdd={() => onAdd(product)} />} />
          ))}
        </div>
      </div>
    </article>
  );
}

interface HomeOffersProps {
  // GET /products/home; null while loading. The parent leaves the section out when it is empty.
  stores: HomeStore[] | null;
}

// "Order now for less" on the restaurant home page (design/restaurant-home/home.dc.html): up to
// three store rows (the restaurant's favourites first, then the nearest stores with offers), each
// with its four offers that expire soonest. "+" opens the add-to-cart dialog (quantity, the
// one-store cart rule); the card opens the product page.
function HomeOffers({ stores }: HomeOffersProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [adding, setAdding] = useState<Product | null>(null);

  return (
    <section aria-labelledby={titleId} aria-busy={!stores} data-testid="home-offers" className="flex flex-col gap-8">
      <h2 id={titleId} className="mt-2 text-2xl font-extrabold tracking-[-0.5px] sm:text-[28px]">
        {t("restaurantHome.offers.title")}
      </h2>
      {stores === null ? (
        <div aria-hidden="true" className="h-[340px] animate-pulse rounded-[20px] border border-neutral-200 bg-white" />
      ) : (
        stores.map((store) => <StoreRow key={store.id} store={store} onAdd={setAdding} />)
      )}
      {adding && <AddToCartModal product={adding} onClose={() => setAdding(null)} />}
    </section>
  );
}

export default HomeOffers;
