import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight } from "lucide-react";
import OrderImage from "./OrderImage.js";
import OrderItemThumbnails from "./OrderItemThumbnails.js";
import { formatRelativeTime } from "../../utils/notifications.js";
import { formatMoney, formatOrderCode, itemsSummary, ORDER_STATUS_STYLES, orderStatusLabel } from "../../utils/orders.js";
import StoreNameLink from "../store/StoreNameLink.js";
import AnswerDeadline from "./AnswerDeadline.js";
import type { Order } from "../../types/index.js";

interface OrderCardProps {
  order: Order;
  // Label for business_name: the restaurant on the store's side, the store on the restaurant's.
  partyLabel: string;
  // Replaces the default "Details" link, e.g. with the decision or pickup buttons.
  actions?: ReactNode;
  // Shows when the order was sent ("5 min ago"); the restaurant's list only.
  showCreatedAt?: boolean;
  // Links the store name to its profile; restaurant side only, and not on that store's own page.
  linkStore?: boolean;
  // Whose list it is: a Pending order tells the store when it is rejected automatically, and the
  // restaurant until when the store can answer.
  viewer?: "STORE" | "RESTAURANT";
}

// One order on a list or dashboard: its code, products, the other party, total and pickup.
function OrderCard({ order, partyLabel, actions, showCreatedAt, linkStore = false, viewer = "RESTAURANT" }: OrderCardProps) {
  const { t, i18n } = useTranslation();
  const code = formatOrderCode(order.code);

  return (
    <div
      data-testid="order-card"
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative h-32 overflow-hidden">
        <OrderImage
          logoUrl={order.party_logo_url}
          className="h-full w-full"
          imageClassName="transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${ORDER_STATUS_STYLES[order.status]}`}>
            {orderStatusLabel(t, order.status, order.fulfilment_method)}
          </span>
          {order.is_partial && (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
              {t("orders.partialBadge", { accepted: order.accepted_count, count: order.item_count })}
            </span>
          )}
        </div>
        {order.is_overdue && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white">
            <AlertTriangle className="h-3 w-3" />
            {t("pickups.overdueToday")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-800">{t("orders.title", { code })}</h3>
            <p className="truncate text-sm text-gray-500">{itemsSummary(order, t)}</p>
          </div>
          <OrderItemThumbnails order={order} />
        </div>

        <dl className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{partyLabel}</dt>
            <dd className="min-w-0 truncate font-medium text-gray-800">
              {linkStore && order.business_name ? (
                <StoreNameLink storeId={order.store_id} name={order.business_name} className="block" />
              ) : (
                order.business_name
              )}
              {order.city && <span className="font-normal text-gray-500"> · {order.city}</span>}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("orders.items")}</dt>
            <dd className="font-medium text-gray-800">{t("orders.itemCount", { count: order.item_count })}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t("orders.total")}</dt>
            <dd className="font-semibold text-green-700">{formatMoney(order.total)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">
              {order.fulfilment_method === "DELIVERY" ? t("orders.delivery.cardLabel") : t("dashboard.pickupDate")}
            </dt>
            <dd className="text-right font-medium text-gray-800">
              {new Date(
                order.fulfilment_method === "DELIVERY" && order.delivery_estimated_at
                  ? order.delivery_estimated_at
                  : order.pickup_at,
              ).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" })}
            </dd>
          </div>
          {showCreatedAt && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">{t("orders.sentAt")}</dt>
              <dd className="text-right font-medium text-gray-800">{formatRelativeTime(order.created_at, t, i18n.language)}</dd>
            </div>
          )}
        </dl>

        <AnswerDeadline order={order} viewer={viewer} />

        {actions ? (
          <div className="mt-auto flex gap-2">{actions}</div>
        ) : (
          <Link
            to={`/orders/${order.id}`}
            className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
          >
            {t("dashboard.detailsButton")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default OrderCard;
