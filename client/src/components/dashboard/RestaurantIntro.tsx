import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ReceiptText, Search } from "lucide-react";

// The brand, the same in both languages.
export const BRAND_NAME = "Još vrijedi";

interface RestaurantIntroProps {
  // The restaurant's active orders (Pending, Confirmed, InDelivery); null while unknown.
  activeOrders: number | null;
}

// The restaurant dashboard's centred intro (design/restaurant-home/intro.html): the brand as the
// page's h1, a short text and two links sized to their content (search products, My orders with
// the active-order count as a small teal badge); on phones the links stack at full width.
function RestaurantIntro({ activeOrders }: RestaurantIntroProps) {
  const { t } = useTranslation();
  const base =
    "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-5 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

  return (
    <section data-testid="restaurant-intro" className="mx-auto max-w-[600px] px-4 pt-10 pb-11 text-center sm:pt-14 sm:pb-[60px]">
      <h1 className="mb-3.5 text-[34px] leading-tight font-light tracking-[-0.5px] text-[#134E4A] sm:text-[44px]">
        {BRAND_NAME}
      </h1>
      <p className="mb-7 text-base leading-[1.65] text-[#78716C] sm:text-lg">{t("restaurantIntro.text")}</p>
      <nav aria-label={t("restaurantIntro.label")} className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center">
        <Link
          to="/search"
          className={`${base} bg-orange-500 text-white hover:bg-orange-600 focus-visible:outline-orange-500`}
        >
          <Search className="h-[18px] w-[18px]" aria-hidden="true" />
          {t("restaurantIntro.search")}
        </Link>
        <Link
          to="/my-orders"
          className={`${base} border-[1.5px] border-[#0F766E] bg-white text-[#0F766E] hover:bg-[#F0FDFA] focus-visible:outline-[#0F766E]`}
        >
          <ReceiptText className="h-[18px] w-[18px]" aria-hidden="true" />
          {t("restaurantIntro.myOrders")}
          {activeOrders !== null && activeOrders > 0 && (
            <>
              <span
                aria-hidden="true"
                data-testid="active-orders-badge"
                className="rounded-[10px] bg-[#0F766E] px-2 py-px text-xs text-white"
              >
                {activeOrders}
              </span>
              {/* The badge is hidden from screen readers; the link reads "My orders, 2 active orders". */}
              <span className="sr-only">, {t("restaurantIntro.activeOrders", { count: activeOrders })}</span>
            </>
          )}
        </Link>
      </nav>
    </section>
  );
}

export default RestaurantIntro;
