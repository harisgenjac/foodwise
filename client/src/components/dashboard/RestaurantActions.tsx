import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ReceiptText, Search } from "lucide-react";

interface RestaurantActionsProps {
  // The restaurant's active orders (Pending, Confirmed, InDelivery); null while unknown.
  activeOrders: number | null;
}

// The restaurant dashboard's two main links (design/restaurant-home/actions-and-stores.html):
// search products and My orders, with the active-order count as a small teal badge.
function RestaurantActions({ activeOrders }: RestaurantActionsProps) {
  const { t } = useTranslation();
  const base =
    "flex h-14 items-center justify-center gap-2.5 rounded-xl text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

  return (
    <nav aria-label={t("restaurantActions.label")} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Link
        to="/search"
        className={`${base} bg-orange-500 text-white hover:bg-orange-600 focus-visible:outline-orange-500`}
      >
        <Search className="h-5 w-5" aria-hidden="true" />
        {t("restaurantActions.search")}
      </Link>
      <Link
        to="/my-orders"
        className={`${base} border-[1.5px] border-[#0F766E] bg-white text-[#0F766E] hover:bg-[#F0FDFA] focus-visible:outline-[#0F766E]`}
      >
        <ReceiptText className="h-5 w-5" aria-hidden="true" />
        {t("restaurantActions.myOrders")}
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
            <span className="sr-only">, {t("restaurantActions.activeOrders", { count: activeOrders })}</span>
          </>
        )}
      </Link>
    </nav>
  );
}

export default RestaurantActions;
