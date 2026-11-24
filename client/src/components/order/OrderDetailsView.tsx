import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CalendarClock,
  CalendarPlus,
  Clock,
  History,
  ListChecks,
  MapPin,
  PackageCheck,
  Phone,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import DetailItem from "../product/DetailItem.js";
import {
  changeReasonText,
  autoRejected,
  deliveryFailureKey,
  formatAmount,
  formatMoney,
  formatOrderCode,
  formatOrderDateTime,
  isDropped,
  isReduced,
  lineTotal,
  ORDER_STATUS_STYLES,
  orderStatusLabel,
  orderedLineTotal,
} from "../../utils/orders.js";
import type { OrderDetails, OrderParty } from "../../types/index.js";
import SendChangesList from "./SendChangesList.js";
import OrderImage from "./OrderImage.js";
import { hoursText } from "../../utils/schedule.js";
import AnswerDeadline from "./AnswerDeadline.js";


// The restaurant has its own page (components/orderPage/RestaurantOrderView).
type OrderViewer = "STORE" | "ADMIN";

interface OrderDetailsViewProps {
  order: OrderDetails;
  // The store sees the restaurant; the admin sees both (with links to their user pages instead of
  // the product pages).
  viewer: OrderViewer;
  // The viewer's actions, under the items.
  actions?: ReactNode;
}

const sectionTitle = (Icon: typeof Store, title: string) => (
  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-800">
      <Icon className="h-4 w-4" strokeWidth={2} />
    </span>
    {title}
  </h2>
);

// One order: the items with the store's changes, the totals, the changes made at sending, the
// parties and the history (the store's order page and the admin's order page).
function OrderDetailsView({ order, viewer, actions }: OrderDetailsViewProps) {
  const { t } = useTranslation();
  const isAdmin = viewer === "ADMIN";
  const code = formatOrderCode(order.code);
  const totalChanged = Math.round(Number(order.total) * 100) !== Math.round(Number(order.ordered_total) * 100);
  const subtitle = isAdmin
    ? `${order.store.business_name ?? "-"} → ${order.restaurant.business_name ?? "-"}`
    : order.restaurant.business_name;
  // The restaurant's logo (the admin sees the store's).
  const partyLogo = (isAdmin ? order.store : order.restaurant).logo_url;
  const delivery = order.delivery ?? null;
  // No courier is coming any more (failed, or cancelled by the provider or an admin).
  const deliveryClosed = delivery?.status === "FAILED" || delivery?.status === "CANCELLED";

  const historyText = (entry: OrderDetails["history"][number]) => {
    const status = orderStatusLabel(t, entry.to_status, order.fulfilment_method);
    const who = t(`orders.history.sources.${entry.source}`);
    if (entry.item_id === null) {
      return entry.from_status === null ? t("orders.history.created", { who }) : t("orders.history.order", { status, who });
    }
    return t("orders.history.item", { product: entry.product_name ?? "", status, who });
  };

  const partyCard = (party: OrderParty, kind: "STORE" | "RESTAURANT") => {
    const isStoreParty = kind === "STORE";
    const pickupHours = hoursText(party.pickup_schedule, t);
    // The admin opens the user page.
    const link = isAdmin ? { to: `/admin/users/${party.id}`, label: t("orders.viewUser") } : null;
    return (
      <section key={kind} className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
        {sectionTitle(isStoreParty ? Store : UtensilsCrossed, isStoreParty ? t("orders.seller") : t("orders.buyer"))}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-lg font-bold text-neutral-900">{party.business_name || "-"}</p>
            {(party.address || party.city) && (
              <p className="flex items-center gap-2 text-sm text-neutral-600">
                <MapPin className="h-4 w-4 shrink-0 text-neutral-500" />
                {[party.address, party.city].filter(Boolean).join(", ")}
              </p>
            )}
            {party.phone && (
              <a href={`tel:${party.phone}`} className="flex w-fit items-center gap-2 text-sm font-medium text-brand-800 hover:underline">
                <Phone className="h-4 w-4 shrink-0 text-neutral-500" />
                {party.phone}
              </a>
            )}
            {isStoreParty && pickupHours && (
              <p className="flex items-center gap-2 text-sm text-neutral-600">
                <Clock className="h-4 w-4 shrink-0 text-neutral-500" />
                {t("orders.pickupHours")}: {pickupHours}
              </p>
            )}
          </div>
          {link && (
            <Link
              to={link.to}
              className="group inline-flex w-fit shrink-0 items-center gap-1.5 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-900 hover:text-white"
            >
              {link.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </section>
    );
  };

  const parties = isAdmin
    ? [partyCard(order.store, "STORE"), partyCard(order.restaurant, "RESTAURANT")]
    : [partyCard(order.restaurant, "RESTAURANT")];

  return (
    <>
      <section className="space-y-5 rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <OrderImage logoUrl={partyLogo} className="h-16 w-16 shrink-0 rounded-xl border border-neutral-100 sm:h-20 sm:w-20" />
            <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ORDER_STATUS_STYLES[order.status]}`}>
                {orderStatusLabel(t, order.status, order.fulfilment_method)}
              </span>
              {order.is_partial && (
                <span className="inline-flex rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-700">
                  {t("orders.partiallyAccepted")}
                </span>
              )}
              {order.is_overdue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2.5 py-1 text-xs font-semibold text-danger-700">
                  <AlertTriangle className="h-3 w-3" />
                  {t("pickups.overdueToday")}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl">{t("orders.title", { code })}</h1>
            <p className="mt-1 text-neutral-600">{subtitle}</p>
            <AnswerDeadline order={order} viewer={viewer} className="mt-2" />
            {autoRejected(order) && (
              <p data-testid="auto-rejected" className="mt-2 flex items-center gap-1.5 text-sm font-medium text-danger-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("orders.autoReject.rejected")}
              </p>
            )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500">{t("orders.total")}</p>
            <p className="text-2xl font-bold text-neutral-900">{formatMoney(order.total)}</p>
            {totalChanged && <p className="text-sm text-neutral-500 line-through">{formatMoney(order.ordered_total)}</p>}
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-4 rounded-xl bg-neutral-50 p-4 sm:grid-cols-2">
          {order.fulfilment_method === "DELIVERY" ? (
            <>
              <DetailItem
                icon={Truck}
                label={t("orders.delivery.estimated")}
                value={order.delivery_estimated_at ? formatOrderDateTime(order.delivery_estimated_at) : "–"}
              />
              <DetailItem icon={MapPin} label={t("orders.delivery.address")} value={order.delivery_address ?? "–"} />
              {delivery && (
                <DetailItem
                  icon={Truck}
                  label={t("orders.delivery.statusLabel")}
                  value={
                    deliveryClosed
                      ? t("orders.delivery.failed", { reason: t(`orders.delivery.failure.${deliveryFailureKey(delivery)}`) })
                      : t(`orders.delivery.status.${delivery.status}`)
                  }
                  valueClassName={deliveryClosed ? "text-danger-700" : "text-neutral-900"}
                />
              )}
              {delivery?.courier_name && (
                <DetailItem
                  icon={Bike}
                  label={t("orders.delivery.courier")}
                  value={
                    <span className="flex flex-wrap items-center gap-x-2">
                      {delivery.courier_name}
                      {delivery.courier_phone && (
                        <a href={`tel:${delivery.courier_phone}`} className="font-medium text-brand-800 hover:underline">
                          {delivery.courier_phone}
                        </a>
                      )}
                    </span>
                  }
                />
              )}
              {delivery?.delivered_at && (
                <DetailItem icon={PackageCheck} label={t("orders.delivery.deliveredAt")} value={formatOrderDateTime(delivery.delivered_at)} />
              )}
              {order.delivery?.price ? (
                <>
                  <DetailItem icon={Wallet} label={t("orders.delivery.finalFee")} value={formatMoney(order.delivery.price)} />
                  <DetailItem
                    icon={Wallet}
                    label={t("orders.delivery.cash")}
                    value={formatMoney(order.delivery.cash_to_collect ?? 0)}
                  />
                </>
              ) : (
                <DetailItem
                  icon={Wallet}
                  label={t("orders.delivery.fee")}
                  value={formatMoney(order.delivery_fee_estimate ?? 0)}
                />
              )}
              {order.ready_at && (
                <DetailItem icon={Clock} label={t("orders.delivery.readyAt")} value={formatOrderDateTime(order.ready_at)} />
              )}
              {!deliveryClosed && !delivery?.picked_up_at && (
                <DetailItem
                  icon={CalendarClock}
                  label={delivery ? t("orders.delivery.courierPickupFinal") : t("orders.delivery.courierPickup")}
                  value={formatOrderDateTime(order.pickup_at)}
                />
              )}
            </>
          ) : (
            <>
              <DetailItem icon={CalendarClock} label={t("orders.pickup")} value={formatOrderDateTime(order.pickup_at)} />
              {/* A delivery order the restaurant switched to pickup after the delivery failed. */}
              {delivery && (
                <DetailItem icon={Truck} label={t("orders.delivery.cardLabel")} value={t("orders.delivery.switchedToPickup")} />
              )}
            </>
          )}
          <DetailItem icon={CalendarPlus} label={t("orders.sentAt")} value={formatOrderDateTime(order.created_at)} />
          <DetailItem
            icon={ListChecks}
            label={t("orders.partialSetting")}
            value={order.accept_partial ? t("orders.partialOn") : t("orders.partialOff")}
          />
          {order.picked_up_at && (
            <DetailItem
              icon={PackageCheck}
              label={order.fulfilment_method === "DELIVERY" ? t("orderStatus.InDelivery") : t("pickups.tabs.completed")}
              value={formatOrderDateTime(order.picked_up_at)}
            />
          )}
        </dl>

        <SendChangesList changes={order.send_changes} />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
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
                const nameStyle = `font-medium ${dropped ? "text-neutral-500 line-through" : "text-neutral-900"}`;
                return (
                  <tr key={item.id} data-testid="order-item" className="border-b border-neutral-50 align-top">
                    <td className="py-3 pr-3">
                      {isAdmin ? (
                        <span className={nameStyle}>{item.product_name}</span>
                      ) : (
                        <Link to={`/products/${item.product_id}`} className={`${nameStyle} hover:underline`}>
                          {item.product_name}
                        </Link>
                      )}
                      {reason && <p className="mt-0.5 text-xs text-warning-700">{reason}</p>}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      {isReduced(item) ? (
                        <span>
                          <span className="text-neutral-500 line-through">{formatAmount(item.ordered_quantity, item.unit)}</span>
                          {" → "}
                          <span className="font-semibold text-neutral-900">{formatAmount(item.quantity, item.unit)}</span>
                        </span>
                      ) : (
                        <span className={dropped ? "text-neutral-500 line-through" : "text-neutral-900"}>
                          {formatAmount(item.ordered_quantity, item.unit)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap text-neutral-700">{formatMoney(item.unit_price)}</td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ORDER_STATUS_STYLES[item.status]}`}>
                        {orderStatusLabel(t, item.status, order.fulfilment_method)}
                      </span>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap font-semibold tabular-nums text-neutral-900">
                      {dropped ? (
                        <span className="text-neutral-500 line-through">{formatMoney(orderedLineTotal(item))}</span>
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

        {actions}
      </section>

      {parties}

      {order.history.length > 0 && (
        <section className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          {sectionTitle(History, t("orders.history.title"))}
          <ol className="space-y-3 border-l border-neutral-100 pl-4">
            {order.history.map((entry) => (
              <li key={entry.id} data-testid="order-history" className="text-sm">
                <p className="text-neutral-800">{historyText(entry)}</p>
                {entry.reason && <p className="text-neutral-500">{entry.reason}</p>}
                <time dateTime={entry.created_at} className="text-xs text-neutral-500">
                  {formatOrderDateTime(entry.created_at)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

export default OrderDetailsView;
