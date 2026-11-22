import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ReceiptText, ShoppingBag } from "lucide-react";
import DataTable, { type DataColumn } from "../common/DataTable.js";
import EmptyCard from "../common/EmptyCard.js";
import LoadingSpinner from "../LoadingSpinner.js";
import { ScooterIcon } from "../dashboard/HomeIllustrations.js";
import { formatKm } from "../dashboard/OfferCard.js";
import { formatDate } from "../../utils/admin.js";
import { ORDER_STATUS_STYLES, formatOrderCode, orderStatusLabel } from "../../utils/orders.js";
import type { Order } from "../../types/index.js";

interface StoreOrdersTabProps {
  orders: Order[];
  total: number;
  loading: boolean;
  fetching: boolean;
  onLoadMore: () => void;
}

// The status pill: a partly accepted order that is still Confirmed reads "Djelimično prihvaćena".
// It never wraps, so a long status does not shift the columns.
export function OrderStatusPill({ order }: { order: Order }) {
  const { t } = useTranslation();
  const label =
    order.status === "Confirmed" && order.is_partial ? t("orders.partiallyAccepted") : orderStatusLabel(t, order.status, order.fulfilment_method);
  return (
    <span
      data-testid="order-status"
      className={`inline-flex h-7 items-center rounded-full px-3 text-[13px] font-bold whitespace-nowrap ${ORDER_STATUS_STYLES[order.status]}`}
    >
      {label}
    </span>
  );
}

// The store page's "Moje narudžbe" tab (design/stores/store-orders.html): the restaurant's orders at
// this store, newest first, as a table (cards below md, DataTable): the code and the date, the item
// count and names on one line, the method with its icon, the total, the status pill (a fixed-width
// column) and "Detalji →" to the order. "Prikaži još" loads the next page.
function StoreOrdersTab({ orders, total, loading, fetching, onLoadMore }: StoreOrdersTabProps) {
  const { t, i18n } = useTranslation();

  if (loading) return <LoadingSpinner />;
  if (orders.length === 0) {
    return <EmptyCard testId="store-orders-empty" icon={ReceiptText} title={t("storePage.orders.empty")} text={t("storePage.orders.emptyText")} />;
  }

  const columns: DataColumn<Order>[] = [
    {
      id: "order",
      header: t("storePage.orders.order"),
      card: "title",
      className: "w-[16%]",
      cell: (order) => (
        <div>
          <p className="text-[15px] font-extrabold text-neutral-900">{formatOrderCode(order.code)}</p>
          <p className="mt-0.5 text-[13px] text-neutral-600">{formatDate(order.created_at)}</p>
        </div>
      ),
    },
    {
      id: "items",
      header: t("storePage.orders.products"),
      cardStacked: true,
      className: "max-w-0",
      cell: (order) => {
        const names = order.items.map((item) => item.product_name).join(", ");
        return (
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-neutral-900">{t("storePage.orders.items", { count: order.item_count })}</p>
            <p title={names} className="mt-0.5 truncate text-[13px] text-neutral-600">
              {names}
            </p>
          </div>
        );
      },
    },
    {
      id: "method",
      header: t("storePage.orders.method"),
      className: "w-[16%]",
      cell: (order) => (
        <span className="flex items-center gap-2 text-sm text-neutral-900">
          {order.fulfilment_method === "DELIVERY" ? (
            <ScooterIcon className="h-[18px] w-[18px] shrink-0 text-brand-800" />
          ) : (
            <ShoppingBag className="h-[18px] w-[18px] shrink-0 text-brand-800" aria-hidden="true" />
          )}
          {order.fulfilment_method === "DELIVERY" ? t("storePage.orders.delivery") : t("storePage.orders.pickup")}
        </span>
      ),
    },
    {
      id: "total",
      header: t("storePage.orders.total"),
      className: "w-[13%]",
      cell: (order) => <span className="text-[15px] font-extrabold whitespace-nowrap text-neutral-900">{formatKm(Number(order.total), i18n.language)}</span>,
    },
    {
      id: "status",
      header: t("storePage.orders.status"),
      card: "status",
      // Wide enough for "Djelimično prihvaćena", so the columns never move.
      className: "w-[200px]",
      cell: (order) => <OrderStatusPill order={order} />,
    },
    {
      id: "details",
      header: t("storePage.orders.details"),
      srOnlyHeader: true,
      card: "actions",
      className: "w-[110px] text-right",
      cell: (order) => (
        <Link
          to={`/orders/${order.id}`}
          aria-label={t("storePage.orders.detailsLabel", { code: formatOrderCode(order.code) })}
          className="relative z-10 inline-flex min-h-11 items-center justify-end gap-1 text-sm font-bold text-brand-800 hover:text-brand-900 md:min-h-0"
        >
          {t("storePage.orders.details")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        label={t("storePage.orders.table")}
        rows={orders}
        columns={columns}
        rowKey={(order) => order.id}
        rowTestId={(order) => `store-order-${order.id}`}
        tableWrapperClassName="overflow-hidden rounded-[20px] border border-[#EEEDEB] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04),0_4px_16px_rgba(28,25,23,0.04)]"
        theadClassName="border-b border-[#EEEDEB] text-[13px] font-bold text-neutral-600"
        headCellClassName="px-6 py-3.5"
        bodyCellClassName="px-6 py-4"
        tbodyClassName="divide-y divide-sand"
      />
      {orders.length < total && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={fetching}
            className="h-11 cursor-pointer rounded-full border border-brand-800 bg-white px-5 text-sm font-bold text-brand-800 hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-wait disabled:opacity-60"
          >
            {fetching ? t("common.loading") : t("storePage.orders.showMore")}
          </button>
        </div>
      )}
    </div>
  );
}

export default StoreOrdersTab;
