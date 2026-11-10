import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { CATEGORY_IMAGES } from "../../utils/categoryImages.js";
import { formatMoney, formatOrderCode, itemsSummary, ORDER_STATUS_STYLES } from "../../utils/orders.js";
import type { Order } from "../../types/index.js";

// One compact row of the restaurant's order history; the whole row opens the order.
// On phones it stacks into two lines (code, products and store, then time, total and status).
function OrderHistoryRow({ order }: { order: Order }) {
  const { t, i18n } = useTranslation();
  const statuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;
  const category = order.items[0]?.category;
  const image = (category && CATEGORY_IMAGES[category]) || CATEGORY_IMAGES.Other;
  const time = new Date(order.created_at).toLocaleTimeString(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return (
    <Link
      to={`/orders/${order.id}`}
      className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-orange-50/50 focus-visible:bg-orange-50 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-800">
            {formatOrderCode(order.code)} · {itemsSummary(order, t)}
          </p>
          <p className="truncate text-sm text-gray-500">
            {order.business_name}
            {order.city && ` · ${order.city}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-13 text-sm sm:pl-0">
        <time dateTime={order.created_at} className="text-gray-500 tabular-nums">
          {time}
        </time>
        <span className="font-semibold text-gray-800 tabular-nums">{formatMoney(order.total)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ORDER_STATUS_STYLES[order.status]}`}>
          {statuses[order.status] || order.status}
        </span>
        {order.is_partial && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
            {t("orders.partialBadge", { accepted: order.accepted_count, count: order.item_count })}
          </span>
        )}
        <ChevronRight className="ml-auto hidden h-4 w-4 text-gray-300 transition-colors group-hover:text-orange-500 sm:block" />
      </div>
    </Link>
  );
}

export default OrderHistoryRow;
