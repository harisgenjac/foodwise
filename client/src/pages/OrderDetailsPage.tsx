import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Check,
  Clock,
  History,
  Info,
  ListChecks,
  MapPin,
  PackageCheck,
  Phone,
  SearchX,
  Store,
  UtensilsCrossed,
  X,
} from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import Breadcrumbs from "../components/Breadcrumbs.js";
import EmptyState from "../components/product/EmptyState.js";
import DetailItem from "../components/product/DetailItem.js";
import PickupConfirmModal from "../components/pickup/PickupConfirmModal.js";
import OrderDecisionModal from "../components/order/OrderDecisionModal.js";
import { usePickupActions } from "../hooks/usePickupActions.js";
import { useCancelOrder } from "../hooks/useCancelOrder.js";
import {
  changeReasonText,
  formatAmount,
  formatMoney,
  formatOrderCode,
  isDropped,
  isReduced,
  lineTotal,
  ORDER_STATUS_STYLES,
  orderedLineTotal,
  sendChangeText,
} from "../utils/orders.js";
import type { OrderDetails } from "../types/index.js";

const dateTimeFormat: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" };
const formatDateTime = (value: string) => new Date(value).toLocaleString(undefined, dateTimeFormat);

// One order for its store or its restaurant: the items with the store's changes, the totals, the
// changes made at sending, the other party, the actions and the history.
function OrderDetailsPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const { t } = useTranslation();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const statuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;
  const isStore = user?.role === "STORE";

  const fetchOrder = useCallback(async () => {
    try {
      const response = await api.get(`/orders/${id}`);
      setOrder(response.data.order);
    } catch (err) {
      console.error("Error fetching order:", err);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const pickupActions = usePickupActions(fetchOrder);

  const cancelOrder = useCancelOrder(fetchOrder);

  const listPath = isStore ? "/orders" : "/my-orders";
  const section = { label: t(isStore ? "sidebar.orders" : "sidebar.myOrders"), to: listPath };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl pb-10">
        <Breadcrumbs items={[section]} />
        <LoadingSpinner />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-10">
        <Breadcrumbs items={[section]} />
        <EmptyState
          icon={SearchX}
          title={t("orders.notFoundTitle")}
          subtitle={t("orders.notFoundSubtitle")}
          action={{ to: listPath, label: t("orders.backToList") }}
        />
      </div>
    );
  }

  const code = formatOrderCode(order.code);
  const party = isStore ? order.restaurant : order.store;
  const PartyIcon = isStore ? UtensilsCrossed : Store;
  const isPending = order.status === "Pending";
  const canHandOver = isStore && order.status === "Confirmed";
  const totalChanged = Math.round(Number(order.total) * 100) !== Math.round(Number(order.ordered_total) * 100);
  const handOver = { ...order, business_name: order.restaurant.business_name ?? "" };

  const historyText = (entry: OrderDetails["history"][number]) => {
    const status = statuses[entry.to_status] || entry.to_status;
    const who = t(`orders.history.sources.${entry.source}`);
    if (entry.item_id === null) {
      return entry.from_status === null ? t("orders.history.created", { who }) : t("orders.history.order", { status, who });
    }
    return t("orders.history.item", { product: entry.product_name ?? "", status, who });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <Breadcrumbs items={[section, { label: code }]} />

      <section className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ORDER_STATUS_STYLES[order.status]}`}>
                {statuses[order.status] || order.status}
              </span>
              {order.is_partial && (
                <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  {t("orders.partiallyAccepted")}
                </span>
              )}
              {order.is_overdue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                  <AlertTriangle className="h-3 w-3" />
                  {t("pickups.overdueToday")}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">{t("orders.title", { code })}</h1>
            <p className="mt-1 text-gray-600">{party.business_name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">{t("orders.total")}</p>
            <p className="text-2xl font-bold text-gray-900">{formatMoney(order.total)}</p>
            {totalChanged && (
              <p className="text-sm text-gray-400 line-through">{formatMoney(order.ordered_total)}</p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
          <DetailItem icon={CalendarClock} label={t("orders.pickup")} value={formatDateTime(order.pickup_at)} />
          <DetailItem icon={CalendarPlus} label={t("orders.sentAt")} value={formatDateTime(order.created_at)} />
          <DetailItem
            icon={ListChecks}
            label={t("orders.partialSetting")}
            value={order.accept_partial ? t("orders.partialOn") : t("orders.partialOff")}
          />
          {order.picked_up_at && (
            <DetailItem icon={PackageCheck} label={t("pickups.tabs.completed")} value={formatDateTime(order.picked_up_at)} />
          )}
        </dl>

        {order.send_changes.length > 0 && (
          <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
            <p className="mb-1 flex items-center gap-2 font-semibold">
              <Info className="h-4 w-4" />
              {t("orders.sendChangesTitle")}
            </p>
            <ul className="list-disc space-y-0.5 pl-6">
              {order.send_changes.map((change) => (
                <li key={`${change.product_id}-${change.kind}`}>{sendChangeText(change, t)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3 font-semibold">{t("orders.table.product")}</th>
                <th className="py-2 pr-3 font-semibold">{t("orders.table.quantity")}</th>
                <th className="py-2 pr-3 font-semibold">{t("orders.table.price")}</th>
                <th className="py-2 pr-3 font-semibold">{t("orders.table.status")}</th>
                <th className="py-2 text-right font-semibold">{t("orders.table.total")}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const dropped = isDropped(item);
                const reason = changeReasonText(item, t);
                return (
                  <tr key={item.id} data-testid="order-item" className="border-b border-gray-50 align-top">
                    <td className="py-3 pr-3">
                      <Link
                        to={`/products/${item.product_id}`}
                        className={`font-medium hover:underline ${dropped ? "text-gray-400 line-through" : "text-gray-900"}`}
                      >
                        {item.product_name}
                      </Link>
                      {reason && <p className="mt-0.5 text-xs text-amber-700">{reason}</p>}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      {isReduced(item) ? (
                        <span>
                          <span className="text-gray-400 line-through">{formatAmount(item.ordered_quantity, item.unit)}</span>
                          {" → "}
                          <span className="font-semibold text-gray-900">{formatAmount(item.quantity, item.unit)}</span>
                        </span>
                      ) : (
                        <span className={dropped ? "text-gray-400 line-through" : "text-gray-900"}>
                          {formatAmount(item.ordered_quantity, item.unit)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap text-gray-700">{formatMoney(item.unit_price)}</td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ORDER_STATUS_STYLES[item.status]}`}>
                        {statuses[item.status] || item.status}
                      </span>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap font-semibold tabular-nums text-gray-900">
                      {dropped ? (
                        <span className="text-gray-400 line-through">{formatMoney(orderedLineTotal(item))}</span>
                      ) : (
                        formatMoney(lineTotal(item))
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isStore && isPending && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setDeciding(true)}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 font-semibold text-white shadow-sm shadow-green-600/20 transition-colors hover:bg-green-700"
            >
              <Check className="h-4 w-4" />
              {t("orders.decideButton")}
            </button>
          </div>
        )}
        {!isStore && isPending && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => cancelOrder.request({ id: order.id, code: order.code, storeName: order.store.business_name ?? "" })}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 font-semibold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <X className="h-4 w-4" />
              {t("orders.cancelButton")}
            </button>
          </div>
        )}
        {canHandOver && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => pickupActions.request("complete", handOver)}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 font-semibold text-white shadow-sm shadow-green-600/20 transition-colors hover:bg-green-700"
            >
              <PackageCheck className="h-4 w-4" />
              {t("pickups.completeButton")}
            </button>
            {order.is_overdue && (
              <button
                type="button"
                onClick={() => pickupActions.request("cancel-overdue", handOver)}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2.5 font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <CalendarX className="h-4 w-4" />
                {t("pickups.cancelOverdueButton")}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <PartyIcon className="h-4 w-4" strokeWidth={2} />
          </span>
          {isStore ? t("reservations.buyer") : t("reservations.seller")}
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-lg font-bold text-gray-900">{party.business_name || "-"}</p>
            {(party.address || party.city) && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                {[party.address, party.city].filter(Boolean).join(", ")}
              </p>
            )}
            {party.phone && (
              <a href={`tel:${party.phone}`} className="flex w-fit items-center gap-2 text-sm font-medium text-orange-700 hover:underline">
                <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                {party.phone}
              </a>
            )}
            {!isStore && party.pickup_hours && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                {t("reservations.pickupHours")}: {party.pickup_hours}
              </p>
            )}
          </div>
          {!isStore && (
            <Link
              to={`/stores/${order.store_id}`}
              className="group inline-flex w-fit shrink-0 items-center gap-1.5 rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
            >
              {t("reservations.viewStore")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </section>

      {order.history.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <History className="h-4 w-4" strokeWidth={2} />
            </span>
            {t("orders.history.title")}
          </h2>
          <ol className="space-y-3 border-l border-gray-100 pl-4">
            {order.history.map((entry) => (
              <li key={entry.id} data-testid="order-history" className="text-sm">
                <p className="text-gray-800">{historyText(entry)}</p>
                {entry.reason && <p className="text-gray-500">{entry.reason}</p>}
                <time dateTime={entry.created_at} className="text-xs text-gray-400">
                  {formatDateTime(entry.created_at)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}

      {pickupActions.pending && (
        <PickupConfirmModal
          {...pickupActions.pending}
          busy={pickupActions.busy}
          onClose={pickupActions.close}
          onConfirm={pickupActions.confirm}
        />
      )}

      {deciding && (
        <OrderDecisionModal
          order={order}
          restaurant={order.restaurant.business_name ?? ""}
          onClose={() => setDeciding(false)}
          onDecided={fetchOrder}
        />
      )}

      {cancelOrder.modal}
    </div>
  );
}

export default OrderDetailsPage;
