import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import DragCarousel from "../common/DragCarousel.js";
import type { Product } from "../../types/index.js";

// A row shows this many cards side by side; with more it becomes a slider.
export const ROW_SIZE = 4;

// The store page's card widths: one and a bit on phones (so the next card peeks out and the row
// reads as swipeable), two on tablets, four from lg up (20 px gaps).
export const STORE_PAGE_ITEM = "w-[78%] sm:w-[calc(50%-10px)] lg:w-[calc(25%-15px)]";

interface ProductTrackProps {
  products: Product[];
  renderCard: (product: Product) => ReactNode;
  // The width of one card at each breakpoint (without the lg grid case).
  itemClassName?: string;
}

// The cards of one row (the store page's rows, a store on Search). More than four: a DragCarousel
// with the round lime arrows (hidden at the ends), mouse drag, swipe and scroll snap. Four or
// fewer: four columns from lg up, a swipeable track below.
function ProductTrack({ products, renderCard, itemClassName = STORE_PAGE_ITEM }: ProductTrackProps) {
  const { t } = useTranslation();
  const item = `flex-none snap-start ${itemClassName}`;

  if (products.length > ROW_SIZE) {
    return (
      // The carousel keeps 28 px on each side for its arrows from md up; pulling it out by the
      // 24 px padding around it lines its cards up with the rows without a slider.
      <div data-testid="product-slider" className="md:-mx-6">
        <DragCarousel
          previousLabel={t("storePage.previous")}
          nextLabel={t("storePage.next")}
          gapClassName="gap-5"
          arrowPositionClassName="top-[70px]"
        >
          {products.map((product) => (
            <li key={product.id} className={item}>
              {renderCard(product)}
            </li>
          ))}
        </DragCarousel>
      </div>
    );
  }

  return (
    <ul
      data-testid="product-track"
      className="flex snap-x snap-mandatory gap-5 overflow-x-auto px-0.5 pt-1 pb-3 [scrollbar-width:none] lg:grid lg:grid-cols-4 lg:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {products.map((product) => (
        <li key={product.id} className={`${item} lg:w-auto`}>
          {renderCard(product)}
        </li>
      ))}
    </ul>
  );
}

export default ProductTrack;
