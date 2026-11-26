import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronDown } from "lucide-react";
import SendChangesList from "../order/SendChangesList.js";
import { formatOrderDateTime, orderStatusLabel } from "../../utils/orders.js";
import { hoursText } from "../../utils/schedule.js";
import { CARD_LINK, PAGE_CARD } from "./styles.js";
import type { OrderDetails, OrderProblem, ProblemStatus } from "../../types/index.js";

interface Row {
  label: string;
  value: ReactNode;
}

const PROBLEM_STATUS_STYLES: Record<ProblemStatus, string> = {
  OPEN: "bg-warning-50 text-warning-800",
  IN_PROGRESS: "bg-info-50 text-info-800",
  RESOLVED: "bg-success-100 text-success-800",
};

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} data-testid="detail-row" className="min-w-0">
          <dt className="text-[13px] text-neutral-600">{row.label}</dt>
          <dd className="text-[15px] font-semibold break-words text-neutral-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// The restaurant's problem reports on this order, with their status and the admin's reply.
function ProblemReports({ problems }: { problems: OrderProblem[] }) {
  const { t } = useTranslation();
  return (
    <div data-testid="problem-reports">
      <h3 className="mb-2 text-[15px] font-extrabold text-neutral-900">{t("orderPage.problem.reportsTitle")}</h3>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {problems.map((problem) => (
          <li key={problem.id} data-testid="problem-report" className="rounded-xl border border-neutral-200 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-neutral-900">{t(`orders.problems.reasons.${problem.reason}`)}</span>
              <span
                className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold ${PROBLEM_STATUS_STYLES[problem.status]}`}
              >
                {t(`orders.problems.statuses.${problem.status}`)}
              </span>
              <span className="text-xs text-neutral-600">{formatOrderDateTime(problem.created_at)}</span>
            </div>
            {problem.text && <p className="mt-1 text-sm text-neutral-700">{problem.text}</p>}
            {problem.admin_reply && (
              <div data-testid="problem-reply" className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-neutral-800">
                <p className="text-xs font-bold text-brand-800">
                  {t("orderPage.problem.reply")}
                  {problem.replied_at && ` · ${formatOrderDateTime(problem.replied_at)}`}
                </p>
                <p>{problem.admin_reply}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// "Detalji narudžbe", "Prodavnica" and "Historija" (design/order-details/): one
// card of collapsible sections, all collapsed at first; each header shows a short summary on the
// right and is a button with aria-expanded and aria-controls.
function OrderDetailsAccordion({ order }: { order: OrderDetails }) {
  const { t } = useTranslation();
  const baseId = useId();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const store = order.store;

  // Detalji narudžbe: only what the hero, the steps and the cards above do not show (the delivery's
  // status, times, fee and cash are all up there).
  const rows: Row[] = [];
  if (order.fulfilment_method === "DELIVERY") {
    rows.push({ label: t("orders.delivery.address"), value: order.delivery_address ?? "–" });
  }
  rows.push({ label: t("orders.sentAt"), value: formatOrderDateTime(order.created_at) });
  rows.push({ label: t("orders.partialSetting"), value: order.accept_partial ? t("orders.partialOn") : t("orders.partialOff") });
  const problems = order.problems ?? [];

  // Prodavnica: address, phone, pickup hours, and its page.
  const pickupHours = hoursText(store.pickup_schedule, t);
  const storeRows: Row[] = [
    { label: t("orderPage.store.address"), value: [store.address, store.city].filter(Boolean).join(", ") || "–" },
    {
      label: t("orderPage.store.phone"),
      value: store.phone ? (
        <a href={`tel:${store.phone}`} className={`${CARD_LINK} text-brand-800`}>
          {store.phone}
        </a>
      ) : (
        "–"
      ),
    },
    ...(pickupHours ? [{ label: t("orders.pickupHours"), value: pickupHours }] : []),
  ];

  const historyText = (entry: OrderDetails["history"][number]) => {
    const status = orderStatusLabel(t, entry.to_status, order.fulfilment_method);
    const who = t(`orders.history.sources.${entry.source}`);
    if (entry.item_id === null) {
      return entry.from_status === null ? t("orders.history.created", { who }) : t("orders.history.order", { status, who });
    }
    return t("orders.history.item", { product: entry.product_name ?? "", status, who });
  };

  const sections: { key: string; title: string; summary: string; content: ReactNode }[] = [
    {
      key: "details",
      title: t("orderPage.accordion.orderDetails"),
      summary: t("orderPage.accordion.rows", { count: rows.length }),
      content: (
        <div className="flex flex-col gap-4">
          <Rows rows={rows} />
          <SendChangesList changes={order.send_changes} />
          {problems.length > 0 && <ProblemReports problems={problems} />}
        </div>
      ),
    },
    {
      key: "store",
      title: t("orderPage.accordion.store"),
      summary: store.business_name ?? "",
      content: (
        <div className="flex flex-col gap-4">
          <Rows rows={storeRows} />
          <Link
            to={`/stores/${order.store_id}`}
            className="inline-flex h-11 w-fit items-center gap-1.5 rounded-full bg-brand-50 px-[18px] text-sm font-bold text-brand-800 hover:bg-brand-100 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300"
          >
            {t("orderPage.store.page")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ),
    },
    {
      key: "history",
      title: t("orderPage.accordion.history"),
      summary: t("orderPage.accordion.changes", { count: order.history.length }),
      content:
        order.history.length > 0 ? (
          <ol className="m-0 list-none space-y-3 border-l-2 border-neutral-100 p-0 pl-4">
            {order.history.map((entry) => (
              <li key={entry.id} data-testid="order-history" className="text-sm">
                <p className="text-neutral-800">{historyText(entry)}</p>
                {entry.reason && <p className="text-neutral-600">{entry.reason}</p>}
                <time dateTime={entry.created_at} className="text-xs text-neutral-600">
                  {formatOrderDateTime(entry.created_at)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-neutral-600">{t("orderPage.accordion.noHistory")}</p>
        ),
    },
  ];

  return (
    <div data-testid="order-accordion" className={`${PAGE_CARD} overflow-hidden`}>
      {sections.map((section) => {
        const isOpen = Boolean(open[section.key]);
        const buttonId = `${baseId}-${section.key}-button`;
        const panelId = `${baseId}-${section.key}-panel`;
        return (
          <div key={section.key} className="border-b border-neutral-100 last:border-b-0">
            <h2 className="m-0">
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen((current) => ({ ...current, [section.key]: !isOpen }))}
                className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-5 py-[18px] text-left hover:bg-neutral-50 focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-brand-300 sm:px-6"
              >
                <span className="flex-1 text-base font-extrabold text-neutral-900">{section.title}</span>
                <span data-testid="accordion-summary" className="max-w-[45%] truncate text-sm font-medium text-neutral-600">
                  {section.summary}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-5 w-5 shrink-0 text-neutral-600 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
            </h2>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen} className="px-5 pb-5 sm:px-6">
              {section.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default OrderDetailsAccordion;
