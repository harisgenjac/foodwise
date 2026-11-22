import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, ChevronDown, Flame, PackageOpen, Plus, Search, SearchX } from "lucide-react";
import DragCarousel from "../common/DragCarousel.js";
import EmptyCard from "../common/EmptyCard.js";
import LoadMore from "../LoadMore.js";
import LoadingSpinner from "../LoadingSpinner.js";
import OfferCard, { discountPercent } from "../dashboard/OfferCard.js";
import CartStepper, { minimumQuantity } from "./CartStepper.js";
import { getDaysUntilExpiry } from "../../utils/expiry.js";
import type { Product } from "../../types/index.js";

// "Ističe uskoro": products that expire today or tomorrow.
const SOON_DAYS = 1;
// A row shows this many cards side by side; with more it becomes a slider.
export const ROW_SIZE = 4;

export const PRODUCT_SORTS = ["expiry", "discount", "priceAsc", "priceDesc", "name"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const price = (product: Product) => Number(product.discounted_price);
const discount = (product: Product) => discountPercent(Number(product.original_price), price(product));

const COMPARE: Record<ProductSort, (a: Product, b: Product) => number> = {
  expiry: (a, b) => getDaysUntilExpiry(a) - getDaysUntilExpiry(b),
  discount: (a, b) => discount(b) - discount(a),
  priceAsc: (a, b) => price(a) - price(b),
  priceDesc: (a, b) => price(b) - price(a),
  name: (a, b) => a.name.localeCompare(b.name, "bs"),
};

// The products in the chosen order; ties keep the server's order (soonest expiry, then id).
export const sortProducts = (products: Product[], sort: ProductSort) =>
  products.map((product, index) => ({ product, index })).sort((a, b) => COMPARE[sort](a.product, b.product) || a.index - b.index).map(({ product }) => product);

export interface CartActions {
  quantityOf: (productId: number) => number;
  setQuantity: (product: Pick<Product, "id" | "name">, quantity: number) => void;
  busyId: number | null;
}

interface StoreProductsTabProps {
  products: Product[];
  total: number;
  loading: boolean;
  fetching: boolean;
  onLoadMore: () => void;
  cart: CartActions;
}

// The width of a card in a row: one and a bit on phones (so the next card peeks out and the row
// reads as swipeable), two on tablets, four from lg up (20 px gaps).
const ITEM = "w-[78%] flex-none snap-start sm:w-[calc(50%-10px)] lg:w-[calc(25%-15px)]";

// One row: its heading and the cards. More than four cards: a DragCarousel with the lime arrows,
// mouse drag, swipe and scroll snap. Four or fewer: four columns from lg up, a swipeable track below.
function ProductRow({ id, title, soon = false, products, renderCard }: { id: string; title: string; soon?: boolean; products: Product[]; renderCard: (product: Product) => ReactNode }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby={id} data-testid="product-row" className="flex flex-col gap-3.5">
      <h2
        id={id}
        className={`flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.01em] ${soon ? "text-accent-700" : "text-neutral-900"}`}
      >
        {soon && <Flame className="h-5 w-5" aria-hidden="true" />}
        {title}
      </h2>
      {products.length > ROW_SIZE ? (
        // The carousel keeps 28 px on each side for its arrows from md up; pulling it out by the page's
        // 24 px padding lines its cards up with the rows without a slider.
        <div data-testid="product-slider" className="md:-mx-6">
          <DragCarousel
            previousLabel={t("storePage.previous")}
            nextLabel={t("storePage.next")}
            gapClassName="gap-5"
            arrowPositionClassName="top-[70px]"
          >
            {products.map((product) => (
              <li key={product.id} className={ITEM}>
                {renderCard(product)}
              </li>
            ))}
          </DragCarousel>
        </div>
      ) : (
        <ul className="flex snap-x snap-mandatory gap-5 overflow-x-auto px-0.5 pt-1 pb-3 [scrollbar-width:none] lg:grid lg:grid-cols-4 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
          {products.map((product) => (
            <li key={product.id} className={`${ITEM} lg:w-auto`}>
              {renderCard(product)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The store page's Products tab (design/stores/store-products.html): a search, the sort and the
// category chips with counts. With "Sve" and no search: "Ističe uskoro" (today or tomorrow), then
// one row per category (a product in "Ističe uskoro" is in its category row too). With a category
// or a search: every match in a grid of four per row. Each card's "+" puts the minimum amount in
// the cart at once and becomes the quantity stepper.
function StoreProductsTab({ products, total, loading, fetching, onLoadMore, cart }: StoreProductsTabProps) {
  const { t } = useTranslation();
  const categoryLabels = t("categories", { returnObjects: true }) as Record<string, string>;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductSort>("expiry");
  const [category, setCategory] = useState("");

  if (loading) return <LoadingSpinner />;
  if (products.length === 0) {
    return <EmptyCard testId="store-products-empty" icon={PackageOpen} title={t("store.storeNoProducts")} text={t("store.storeNoProductsSubtitle")} />;
  }

  // The categories this store has on offer, in the usual category order, with their counts.
  const categories = Object.keys(categoryLabels)
    .map((key) => ({ key, count: products.filter((product) => product.category === key).length }))
    .filter((entry) => entry.count > 0);
  const query = search.trim().toLocaleLowerCase("bs");
  const sorted = sortProducts(products, sort);
  const gridMode = category !== "" || query !== "";
  const matches = sorted.filter(
    (product) => (!category || product.category === category) && (!query || product.name.toLocaleLowerCase("bs").includes(query)),
  );

  const renderCard = (product: Product) => {
    const inCart = cart.quantityOf(product.id);
    const max = parseFloat(product.available_quantity ?? product.quantity);
    const busy = cart.busyId === product.id;
    return (
      <OfferCard
        product={product}
        testId="store-product-card"
        selected={inCart > 0}
        fromStore
        stretchedLink={false}
        action={
          inCart > 0 ? undefined : (
            <button
              type="button"
              disabled={busy || max <= 0}
              onClick={() => cart.setQuantity(product, minimumQuantity(product.unit, max))}
              aria-label={t("stepper.add", { name: product.name })}
              className="relative z-10 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-800 text-white hover:bg-brand-900 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-wait disabled:opacity-60"
            >
              <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
            </button>
          )
        }
        footer={
          inCart > 0 ? (
            <CartStepper
              name={product.name}
              unit={product.unit}
              value={inCart}
              max={max}
              busy={busy}
              onChange={(quantity) => cart.setQuantity(product, quantity)}
            />
          ) : undefined
        }
      />
    );
  };

  const soon = sorted.filter((product) => getDaysUntilExpiry(product) <= SOON_DAYS);
  const chip = (selected: boolean) =>
    `flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold whitespace-nowrap focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 sm:h-[38px] ${
      selected ? "border-brand-800 bg-brand-800 text-white" : "border-neutral-200 bg-white text-neutral-900 hover:border-brand-800"
    }`;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap gap-3">
          <label className="relative block min-w-0 flex-[1_1_280px]">
            <span className="sr-only">{t("store.page.searchPlaceholder")}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-500" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("store.page.searchPlaceholder")}
              className="h-12 w-full rounded-xl border border-neutral-200 bg-white pr-3.5 pl-11 text-base text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-brand-800 focus:ring-[3px] focus:ring-brand-100 sm:text-[15px]"
            />
          </label>
          <label className="relative block flex-[1_1_220px] sm:flex-[0_0_260px]">
            <span className="sr-only">{t("storePage.sortLabel")}</span>
            <ArrowUpDown className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-500" aria-hidden="true" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ProductSort)}
              className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-neutral-200 bg-white pr-10 pl-11 text-base text-neutral-900 outline-none focus:border-brand-800 focus:ring-[3px] focus:ring-brand-100 sm:text-[15px]"
            >
              {PRODUCT_SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`storePage.sort.${value}`)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 h-[18px] w-[18px] -translate-y-1/2 text-neutral-600" aria-hidden="true" />
          </label>
        </div>
        <div role="group" aria-label={t("store.page.categoriesLabel")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {[{ key: "", count: products.length }, ...categories].map((entry) => {
            const selected = category === entry.key;
            return (
              <button key={entry.key || "all"} type="button" aria-pressed={selected} onClick={() => setCategory(entry.key)} className={chip(selected)}>
                {entry.key ? (categoryLabels[entry.key] ?? entry.key) : t("store.page.allCategories")}
                <span className={`text-xs font-bold ${selected ? "text-brand-200" : "text-neutral-500"}`}>{entry.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {gridMode ? (
        matches.length === 0 ? (
          <EmptyCard testId="store-products-no-match" icon={SearchX} title={t("store.noResultsTitle")} text={t("store.page.noResultsSubtitle")} />
        ) : (
          <ul data-testid="product-grid" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {matches.map((product) => (
              <li key={product.id}>
                {renderCard(product)}
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          {soon.length > 0 && (
            <ProductRow id="store-row-soon" title={t("store.page.expiringSoon")} soon products={soon} renderCard={renderCard} />
          )}
          {categories.map((entry) => (
            <ProductRow
              key={entry.key}
              id={`store-row-${entry.key}`}
              title={categoryLabels[entry.key] ?? entry.key}
              products={sorted.filter((product) => product.category === entry.key)}
              renderCard={renderCard}
            />
          ))}
        </>
      )}

      <LoadMore shown={products.length} total={total} fetching={fetching} onLoadMore={onLoadMore} />
    </div>
  );
}

export default StoreProductsTab;
