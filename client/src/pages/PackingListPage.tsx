import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Clock,
  Hourglass,
  Phone,
  Printer,
  Store,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import { useLiveOrderRefresh } from "../context/LiveEventsContext.js";
import { useFetch } from "../hooks/useFetch.js";
import { deliveryFailedBeforePickup, formatAmount, formatOrderCode, isDropped } from "../utils/orders.js";
import type { PackingOrder, PackingProduct } from "../types/index.js";

const timeFormat: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

// The store's packing list: what to prepare today and by when. The products summed for gathering
// from the shelf, then each order by its ready time (a delivery's ready time, a pickup's pickup
// time) with the accepted lines. It updates live and prints without the app's navigation.
function PackingListPage() {
  const { t, i18n } = useTranslation();
  const [pendingCount, setPendingCount] = useState(0);
  const { data: orders, meta, loading, error, refetch } = useFetch<PackingOrder>("/orders/packing", "orders", {});
  const products = (meta?.products as PackingProduct[] | undefined) ?? [];

  // Orders still waiting for the store's decision are not on the list yet; a note points to them.
  const fetchPending = useCallback(async () => {
    try {
      const response = await api.get("/orders/store", { params: { status: "Pending", limit: 1 } });
      setPendingCount(response.data.total ?? 0);
    } catch (err) {
      console.error("Error fetching pending orders:", err);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  useLiveOrderRefresh(() => {
    refetch();
    fetchPending();
  });

  const today = new Date();
  const weekdays = t("dashboard.weekdays", { returnObjects: true }) as string[];
  const months = t("dashboard.months", { returnObjects: true }) as string[];
  const todayText = t("dashboard.dateFormat", {
    weekday: weekdays[today.getDay()],
    day: today.getDate(),
    month: months[today.getMonth()],
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10 print:max-w-none print:space-y-4 print:pb-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <ProductPageHeader
          title={t("packing.title")}
          subtitle={t("packing.subtitle", { date: todayText })}
          icon={ClipboardList}
          {...(!loading && { count: t("packing.orderCount", { count: orders.length }) })}
        />
        {orders.length > 0 && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 print:hidden"
          >
            <Printer className="h-4 w-4" />
            {t("packing.print")}
          </button>
        )}
      </div>

      {pendingCount > 0 && (
        <Link
          to="/orders"
          className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition-colors hover:bg-amber-100 print:hidden"
        >
          <Hourglass className="h-4 w-4 shrink-0" />
          <span className="flex-1">{t("packing.pendingNote", { count: pendingCount })}</span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : error && orders.length === 0 ? (
        <LoadErrorState />
      ) : orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("packing.emptyTitle")} subtitle={t("packing.emptySubtitle")} />
      ) : (
        <>
          <section
            aria-labelledby="packing-products"
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm print:break-inside-avoid print:shadow-none sm:p-5"
          >
            <h2 id="packing-products" className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("packing.productsTitle")}
            </h2>
            <ul className="divide-y divide-gray-100">
              {products.map((product) => (
                <li
                  key={`${product.product_id}`}
                  data-testid="packing-product"
                  className="flex items-baseline justify-between gap-4 py-2"
                >
                  <span className="min-w-0 truncate font-medium text-gray-800">{product.product_name}</span>
                  <span className="shrink-0 text-right">
                    <span className="font-bold text-gray-900">{formatAmount(product.quantity, product.unit)}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {t("packing.inOrders", { count: product.order_count })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="packing-orders">
            <h2 id="packing-orders" className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("packing.ordersTitle")}
            </h2>
            <div className="flex flex-col gap-3">
              {orders.map((order) => {
                const isDelivery = order.fulfilment_method === "DELIVERY";
                const failed = deliveryFailedBeforePickup(order);
                const readyAt = new Date(order.ready_time);
                return (
                  <article
                    key={order.id}
                    data-testid="packing-order"
                    className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm print:break-inside-avoid print:shadow-none sm:flex-row"
                  >
                    <div className="flex shrink-0 items-center gap-2 bg-orange-50 px-4 py-3 text-orange-700 sm:w-32 sm:flex-col sm:justify-center sm:gap-1 sm:py-4">
                      <Clock className="h-4 w-4 opacity-70" strokeWidth={2} />
                      <span className="text-2xl font-bold tracking-tight">
                        {readyAt.toLocaleTimeString(i18n.language, timeFormat)}
                      </span>
                      <span className="text-xs font-medium opacity-80">
                        {t(isDelivery ? "packing.readyForCourier" : "packing.readyForPickup")}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 space-y-3 p-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="text-base font-bold text-gray-900">
                          {t("orders.title", { code: formatOrderCode(order.code) })}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isDelivery ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700"
                          }`}
                        >
                          {isDelivery ? <Truck className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                          {isDelivery ? t("orders.delivery.badge") : t("packing.pickupBadge")}
                        </span>
                        {failed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                            <AlertTriangle className="h-3 w-3" />
                            {t("packing.deliveryFailed")}
                          </span>
                        ) : (
                          isDelivery &&
                          order.delivery && (
                            <span className="text-xs text-gray-500">
                              {t(`orders.delivery.status.${order.delivery.status}`)}
                              {order.delivery.courier_name && ` · ${order.delivery.courier_name}`}
                            </span>
                          )
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <UtensilsCrossed className="h-4 w-4 shrink-0 text-gray-400" />
                          <span className="truncate font-medium text-gray-800">{order.business_name}</span>
                        </span>
                        {order.party_phone && (
                          <a
                            href={`tel:${order.party_phone}`}
                            className="inline-flex items-center gap-1.5 font-medium text-orange-700 hover:underline"
                          >
                            <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                            {order.party_phone}
                          </a>
                        )}
                      </div>

                      <ul className="space-y-1 text-sm">
                        {order.items
                          .filter((item) => !isDropped(item))
                          .map((item) => (
                            <li key={item.id} className="flex items-baseline gap-2">
                              <span
                                aria-hidden="true"
                                className="hidden h-3 w-3 shrink-0 rounded-sm border border-gray-400 print:inline-block"
                              />
                              <span className="font-semibold text-gray-900">
                                {formatAmount(item.quantity, item.unit)}
                              </span>
                              <span className="min-w-0 text-gray-700">{item.product_name}</span>
                            </li>
                          ))}
                      </ul>
                    </div>

                    <div className="flex shrink-0 items-center border-t border-gray-100 p-3 print:hidden sm:border-t-0 sm:border-l">
                      <Link
                        to={`/orders/${order.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-50"
                      >
                        {t("pickups.details")}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default PackingListPage;
