import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Clock,
  History,
  ListChecks,
  MapPin,
  PackageCheck,
  Phone,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import DetailItem from "../product/DetailItem.js";
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
} from "../../utils/orders.js";
import type { OrderDetails, OrderParty } from "../../types/index.js";
import SendChangesList from "./SendChangesList.js";

const dateTimeFormat: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" };
const formatDateTime = (value: string) => new Date(value).toLocaleString(undefined, dateTimeFormat);

export type OrderViewer = "STORE" | "RESTAURANT" | "ADMIN";

interface OrderDetailsViewProps {
  order: OrderDetails;
  // The store and the restaurant see the other party; the admin sees both (with links to their
  // user pages instead of the product and store pages).
  viewer: OrderViewer;
  // The viewer's actions, under the items.
  actions?: ReactNode;
}

const sectionTitle = (Icon: typeof Store, title: string) => (
  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
      <Icon className="h-4 w-4" strokeWidth={2} />
    </span>
    {title}
  </h2>
);

// One order: the items with the store's changes, the totals, the changes made at sending, the
// parties and the history (the order page of both parties and the admin's order page).
function OrderDetailsView({ order, viewer, actions }: OrderDetailsViewProps) {
  const { t } = useTranslation();
  const statuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;
  const isAdmin = viewer === "ADMIN";
  const code = formatOrderCode(order.code);
  const totalChanged = Math.round(Number(order.total) * 100) !== Math.round(Number(order.ordered_total) * 100);
  const subtitle = isAdmin
    ? `${order.store.business_name ?? "-"} → ${order.restaurant.business_name ?? "-"}`
    : (viewer === "STORE" ? order.restaurant : order.store).business_name;

  const historyText = (entry: OrderDetails["history"][number]) => {
    const status = statuses[entry.to_status] || entry.to_status;
    const who = t(`orders.history.sources.${entry.source}`);
    if (entry.item_id === null) {
      return entry.from_status === null ? t("orders.history.created", { who }) : t("orders.history.order", { status, who });
    }
    return t("orders.history.item", { product: entry.product_name ?? "", status, who });
  };

  const partyCard = (party: OrderParty, kind: "STORE" | "RESTAURANT") => {
    const isStoreParty = kind === "STORE";
    // The restaurant needs the store's pickup hours and its page; the admin opens the user page.
    const link = isAdmin
      ? { to: `/admin/users/${party.id}`, label: t("orders.viewUser") }
      : isStoreParty
        ? { to: `/stores/${order.store_id}`, label: t("reservations.viewStore") }
        : null;
    return (
      <section key={kind} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        {sectionTitle(isStoreParty ? Store : UtensilsCrossed, isStoreParty ? t("reservations.seller") : t("reservations.buyer"))}
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
            {isStoreParty && party.pickup_hours && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                {t("reservations.pickupHours")}: {party.pickup_hours}
              </p>
            )}
          </div>
          {link && (
            <Link
              to={link.to}
              className="group inline-flex w-fit shrink-0 items-center gap-1.5 rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
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
    : [viewer === "STORE" ? partyCard(order.restaurant, "RESTAURANT") : partyCard(order.store, "STORE")];

  return (
    <>
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
            <p className="mt-1 text-gray-600">{subtitle}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">{t("orders.total")}</p>
            <p className="text-2xl font-bold text-gray-900">{formatMoney(order.total)}</p>
            {totalChanged && <p className="text-sm text-gray-400 line-through">{formatMoney(order.ordered_total)}</p>}
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

        <SendChangesList changes={order.send_changes} />

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
                const nameStyle = `font-medium ${dropped ? "text-gray-400 line-through" : "text-gray-900"}`;
                return (
                  <tr key={item.id} data-testid="order-item" className="border-b border-gray-50 align-top">
                    <td className="py-3 pr-3">
                      {isAdmin ? (
                        <span className={nameStyle}>{item.product_name}</span>
                      ) : (
                        <Link to={`/products/${item.product_id}`} className={`${nameStyle} hover:underline`}>
                          {item.product_name}
                        </Link>
                      )}
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

        {actions}
      </section>

      {parties}

      {order.history.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          {sectionTitle(History, t("orders.history.title"))}
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
    </>
  );
}

export default OrderDetailsView;
