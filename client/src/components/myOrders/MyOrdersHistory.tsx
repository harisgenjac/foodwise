import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ShoppingBag } from "lucide-react";
import StoreAvatar from "../store/StoreAvatar.js";
import { ScooterIcon } from "../dashboard/HomeIllustrations.js";
import { formatKm } from "../dashboard/OfferCard.js";
import { OrderStatusPill } from "../storePage/StoreOrdersTab.js";
import { CARD_CLASS } from "./MyOrderCard.js";
import { groupByDay } from "../../utils/dayGroups.js";
import { formatClock } from "../../utils/delivery.js";
import { formatOrderCode, itemsSummary } from "../../utils/orders.js";
import { storeTone } from "../../utils/storeTone.js";
import type { Order } from "../../types/index.js";

interface MyOrdersHistoryProps {
  orders: Order[];
  // More orders are on the next page, so the last day may continue there.
  hasMore: boolean;
}

const LINK_CLASS =
  "inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-bold whitespace-nowrap text-brand-800 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800";

// The pieces of one history row, shared by the table and the phone cards.
function useRowParts() {
  const { t, i18n } = useTranslation();
  const money = (value: string) => formatKm(Number(value), i18n.language);

  const store = (order: Order) => {
    const tone = storeTone(order.store_id);
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        <StoreAvatar
          store={{ business_name: order.business_name ?? "", logo_url: order.party_logo_url ?? undefined }}
          decorative
          frameClassName="font-extrabold"
          style={{ backgroundColor: tone.soft, color: tone.strong }}
          className="h-8 w-8 rounded-[10px] text-xs"
        />
        <span className="truncate text-[15px] text-neutral-900" title={order.business_name ?? ""}>
          {order.business_name}
        </span>
      </span>
    );
  };

  const products = (order: Order) => (
    <span className="block min-w-0">
      <span className="block truncate text-[15px] text-neutral-900" title={itemsSummary(order, t)}>
        {itemsSummary(order, t)}
      </span>
      <span className="block text-xs text-neutral-600">
        {t("orders.itemCount", { count: order.item_count })}
        {order.is_partial && (
          <>
            {" · "}
            <span className="font-bold text-brand-800">
              {t("myOrders.history.accepted", { accepted: order.accepted_count, count: order.item_count })}
            </span>
          </>
        )}
      </span>
    </span>
  );

  const method = (order: Order) => (
    <span className="flex items-center gap-2 text-[15px] whitespace-nowrap text-neutral-900">
      {order.fulfilment_method === "DELIVERY" ? (
        <ScooterIcon className="h-[18px] w-[18px] shrink-0 text-neutral-700" />
      ) : (
        <ShoppingBag className="h-[18px] w-[18px] shrink-0 text-neutral-700" aria-hidden="true" />
      )}
      {order.fulfilment_method === "DELIVERY" ? t("myOrders.method.delivery") : t("myOrders.method.pickup")}
    </span>
  );

  // A rejected or cancelled order: the amount it was sent with, struck through and grey (not 0.00).
  // A reduced one: the new total with the old one struck through under it.
  const total = (order: Order) => {
    if (order.status === "Rejected" || order.status === "Cancelled") {
      return (
        <span data-testid="history-total" className="text-[15px] font-extrabold whitespace-nowrap text-neutral-500 line-through">
          <span className="sr-only">{t("myOrders.history.notCharged")} </span>
          {money(order.ordered_total)}
        </span>
      );
    }
    return (
      <span data-testid="history-total" className="inline-flex flex-col">
        <span className="text-[15px] font-extrabold whitespace-nowrap text-neutral-900">{money(order.total)}</span>
        {order.is_partial && (
          <span className="text-xs whitespace-nowrap text-neutral-500 line-through">
            <span className="sr-only">{t("myOrders.card.oldTotal")} </span>
            {money(order.ordered_total)}
          </span>
        )}
      </span>
    );
  };

  const details = (order: Order) => (
    <Link
      to={`/orders/${order.id}`}
      aria-label={t("storePage.orders.detailsLabel", { code: formatOrderCode(order.code) })}
      className={LINK_CLASS}
    >
      {t("storePage.orders.details")}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );

  return { store, products, method, total, details };
}

// History on My orders (design/my-orders/my-orders-history.html): one white card with a table grouped
// by the day the orders were sent (a heading row with the day and its order count), each row the
// code and time, the store, the products (with "2/3 prihvaćeno" after a partial acceptance), the
// method, the total, the status pill (a fixed width, never wraps) and "Detalji →". Below md the
// same groups as cards.
function MyOrdersHistory({ orders, hasMore }: MyOrdersHistoryProps) {
  const { t } = useTranslation();
  const parts = useRowParts();
  const groups = groupByDay(orders, (order) => order.created_at, t);
  // The last day may continue on the next page: its count says "or more".
  const countText = (count: number, index: number) =>
    hasMore && index === groups.length - 1 ? t("myOrders.history.countMore", { count }) : t("myOrders.history.count", { count });

  return (
    <div data-testid="history">
      {/* From md up: the table. */}
      <div className={`${CARD_CLASS} hidden overflow-hidden md:block`}>
        <table aria-label={t("myOrders.history.table")} className="w-full table-fixed text-left">
          <thead className="border-b border-[#EEEDEB] text-[13px] font-bold text-neutral-600">
            <tr>
              <th scope="col" className="w-[12%] px-6 py-3.5">{t("myOrders.history.order")}</th>
              <th scope="col" className="w-[19%] px-3 py-3.5">{t("myOrders.history.store")}</th>
              <th scope="col" className="px-3 py-3.5">{t("myOrders.history.products")}</th>
              <th scope="col" className="w-[13%] px-3 py-3.5">{t("myOrders.history.method")}</th>
              <th scope="col" className="w-[12%] px-3 py-3.5">{t("myOrders.history.total")}</th>
              <th scope="col" className="w-[150px] px-3 py-3.5">{t("myOrders.history.status")}</th>
              <th scope="col" className="w-[110px] px-6 py-3.5">
                <span className="sr-only">{t("storePage.orders.details")}</span>
              </th>
            </tr>
          </thead>
          {groups.map((group, index) => (
            <tbody key={group.key} className="divide-y divide-sand">
              <tr className="bg-neutral-50">
                <th scope="colgroup" colSpan={5} className="px-6 py-2.5 text-xs font-bold tracking-[0.06em] text-neutral-700 uppercase">
                  {group.title}
                </th>
                <td colSpan={2} className="px-6 py-2.5 text-right text-xs text-neutral-600">
                  {countText(group.items.length, index)}
                </td>
              </tr>
              {group.items.map((order) => (
                <tr key={order.id} data-testid={`history-row-${order.id}`} className="border-t border-sand">
                  <td className="px-6 py-3">
                    <span className="block text-[15px] font-extrabold text-neutral-900">{formatOrderCode(order.code)}</span>
                    <span className="block text-[13px] text-neutral-600">{formatClock(order.created_at)}</span>
                  </td>
                  <td className="px-3 py-3">{parts.store(order)}</td>
                  <td className="px-3 py-3">{parts.products(order)}</td>
                  <td className="px-3 py-3">{parts.method(order)}</td>
                  <td className="px-3 py-3">{parts.total(order)}</td>
                  <td className="px-3 py-3">
                    <OrderStatusPill order={order} />
                  </td>
                  <td className="px-6 py-3 text-right">{parts.details(order)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* Below md: the same days, one card per order. */}
      <div className="flex flex-col gap-5 md:hidden">
        {groups.map((group, index) => (
          <section key={group.key} aria-label={group.title}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-xs font-bold tracking-[0.06em] text-neutral-700 uppercase">{group.title}</h2>
              <span className="text-xs text-neutral-600">{countText(group.items.length, index)}</span>
            </div>
            <ul className="flex flex-col gap-3">
              {group.items.map((order) => (
                <li key={order.id} data-testid="history-card" className={`${CARD_CLASS} flex flex-col gap-3 p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block text-[15px] font-extrabold text-neutral-900">
                        {formatOrderCode(order.code)} <span className="text-[13px] font-normal text-neutral-600">· {formatClock(order.created_at)}</span>
                      </span>
                      <div className="mt-1.5">{parts.store(order)}</div>
                    </div>
                    <OrderStatusPill order={order} />
                  </div>
                  {parts.products(order)}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-3">
                    {parts.method(order)}
                    {parts.total(order)}
                    {parts.details(order)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export default MyOrdersHistory;
