import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, CloudOff, ReceiptText, SearchX, ShoppingBag } from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import EmptyCard from "../components/common/EmptyCard.js";
import FilterBar, { type ActiveFilter } from "../components/filters/FilterBar.js";
import FilterDrawer, { FilterPills } from "../components/filters/FilterDrawer.js";
import SortField from "../components/filters/SortField.js";
import { ScooterIcon } from "../components/dashboard/HomeIllustrations.js";
import MyOrderCard from "../components/myOrders/MyOrderCard.js";
import MyOrdersHistory from "../components/myOrders/MyOrdersHistory.js";
import { MY_ORDERS_SORT_OPTIONS, type MyOrdersSort } from "../components/product/SortSelect.js";
import { useLiveOrderRefresh } from "../context/LiveEventsContext.js";
import { useCancelOrder } from "../hooks/useCancelOrder.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE, HISTORY_PAGE_SIZE } from "../utils/pagination.js";
import type { Order, OrderStatus } from "../types/index.js";

type Tab = "active" | "history";
type Method = "" | "pickup" | "delivery";
type Period = "" | "today" | "7d" | "month";

const DRAWER_ID = "my-orders-filters";
const METHODS: Method[] = ["", "pickup", "delivery"];
// The statuses an order on Active can have (InDelivery: the courier has the goods); History has all.
const ACTIVE_STATUSES: OrderStatus[] = ["Pending", "Confirmed", "InDelivery"];
const HISTORY_STATUSES: OrderStatus[] = [...ACTIVE_STATUSES, "Completed", "Rejected", "Cancelled"];
const PERIODS: Period[] = ["", "today", "7d", "month"];

// The tab counts: every order (History) and every active one (Active), without filters.
interface OrderSummary {
  total: number;
  active: number;
}

// My orders of a restaurant (design/my-orders/): the header with the Aktivne / Historija tabs (the
// counts from /orders/mine/summary), the FilterBar (one search over the product, the store and the
// code; "Filteri" opens the panel with the method, the status and, on History, the period), the
// sort on Active, then one card per active order with its steps (MyOrderCard), or History's table
// grouped by day (MyOrdersHistory), and "Prikaži još". Filters apply as they change; a tab switch
// resets the search and the filters and keeps the sort.
function MyOrdersPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<Method>("");
  const [status, setStatus] = useState<"" | OrderStatus>("");
  // Only on History.
  const [period, setPeriod] = useState<Period>("");
  // Only on Active; History is always newest first.
  const [sort, setSort] = useState<MyOrdersSort>("newest");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [summary, setSummary] = useState<OrderSummary | null>(null);

  const isHistory = tab === "history";
  const filters = { q: search.trim(), method, status };
  const query = isHistory ? { scope: "all", sort: "newest", ...filters, period } : { scope: "active", sort, ...filters };
  // Active loads 12 cards at a time, History 20 rows; a tab, sort or filter change starts again
  // from the first page, a reload keeps the limit.
  const { limit, loadMore } = usePagedLimit(isHistory ? HISTORY_PAGE_SIZE : CARD_PAGE_SIZE, JSON.stringify(query));
  const { data: orders, total, error, loading, fetching, refetch } = useFetch<Order>(
    "/orders/mine",
    "orders",
    { ...query, limit },
    // Each tab is its own list: a switch drops the previous tab's list and shows the loading state.
    { resetKey: tab },
  );

  const fetchSummary = useCallback(async () => {
    try {
      const response = await api.get("/orders/mine/summary");
      setSummary(response.data.summary);
    } catch (err) {
      console.error("Error fetching the order summary:", err);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // The tab and the sort are not filters, so they stay.
  const clearFilters = () => {
    setSearch("");
    setMethod("");
    setStatus("");
    setPeriod("");
  };

  const switchTab = (next: Tab) => {
    if (next !== tab) clearFilters();
    setTab(next);
  };

  const cancelOrder = useCancelOrder(() => {
    refetch();
    fetchSummary();
  });

  // A store's decision or the courier's progress updates the list and the counts live.
  useLiveOrderRefresh(() => {
    refetch();
    fetchSummary();
  });

  const methodLabel = (value: Method) => t(`myOrders.filters.method.${value || "all"}`);
  const statusLabel = (value: "" | OrderStatus) => t(`myOrders.filters.status.${value || "all"}`);
  const periodLabel = (value: Period) => t(`myOrders.filters.period.${value || "all"}`);
  const removeLabel = (filter: string) => t("listFilters.remove", { filter });

  const activeFilters: ActiveFilter[] = [];
  if (method) {
    activeFilters.push({ key: "method", label: methodLabel(method), removeLabel: removeLabel(t("myOrders.filters.methodLabel")), onRemove: () => setMethod("") });
  }
  if (status) {
    activeFilters.push({ key: "status", label: statusLabel(status), removeLabel: removeLabel(t("myOrders.filters.statusLabel")), onRemove: () => setStatus("") });
  }
  if (period) {
    activeFilters.push({ key: "period", label: periodLabel(period), removeLabel: removeLabel(t("myOrders.filters.periodLabel")), onRemove: () => setPeriod("") });
  }
  const hasFilters = search.trim() !== "" || activeFilters.length > 0;
  const totalCount = total ?? orders.length;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "active", label: t("orders.tabs.active"), count: summary?.active },
    { key: "history", label: t("orders.tabs.history"), count: summary?.total },
  ];

  let list;
  if (loading) {
    list = <LoadingSpinner />;
  } else if (error && orders.length === 0) {
    list = <EmptyCard testId="my-orders-error" icon={CloudOff} title={t("common.loadErrorTitle")} text={t("common.loadErrorSubtitle")} />;
  } else if (orders.length === 0) {
    if (hasFilters) {
      list = (
        <EmptyCard
          testId="my-orders-empty"
          icon={SearchX}
          title={t("orders.noResultsTitle")}
          text={t("orders.noResultsSubtitle")}
          action={{ label: t("filters.clear"), onClick: clearFilters }}
        />
      );
    } else if (isHistory) {
      list = (
        <EmptyCard
          testId="my-orders-empty"
          icon={ReceiptText}
          title={t("orders.historyEmptyTitle")}
          text={t("orders.historyEmptySubtitle")}
          link={{ to: "/search", label: t("dashboard.browseOffers") }}
        />
      );
    } else {
      list = (
        <EmptyCard
          testId="my-orders-empty"
          icon={CalendarClock}
          title={t("orders.activeEmptyTitle")}
          text={t("orders.activeEmptySubtitle")}
          action={{ label: t("orders.showHistory"), onClick: () => switchTab("history") }}
          link={{ to: "/search", label: t("dashboard.browseOffers") }}
        />
      );
    }
  } else if (isHistory) {
    list = <MyOrdersHistory orders={orders} hasMore={orders.length < totalCount} />;
  } else {
    list = (
      <div className="flex flex-col gap-4">
        {orders.map((order) => (
          <MyOrderCard
            key={order.id}
            order={order}
            onCancel={(item) => cancelOrder.request({ id: item.id, code: item.code, storeName: item.business_name ?? "" })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1136px] flex-col gap-6 pb-10 font-jakarta text-neutral-900">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
          <ReceiptText className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-[1_1_320px]">
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">{t("orders.myTitle")}</h1>
          <p className="mt-1 text-[15px] text-neutral-600">{t("orders.mySubtitle")}</p>
        </div>
        <div role="tablist" aria-label={t("orders.myTitle")} className="flex shrink-0 gap-1 rounded-full border border-neutral-200 bg-white p-1">
          {tabs.map(({ key, label, count }) => {
            const selected = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`my-orders-tab-${key}`}
                aria-selected={selected}
                aria-controls="my-orders-panel"
                onClick={() => switchTab(key)}
                className={`flex h-11 cursor-pointer items-center gap-2 rounded-full border pr-3.5 pl-[18px] text-sm font-bold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 ${
                  selected ? "border-brand-800 bg-brand-50 text-brand-800" : "border-transparent bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {label}
                {count !== undefined && (
                  <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-brand-100 px-1.5 text-xs font-extrabold text-brand-800">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("myOrders.filters.search")}
        activeFilters={activeFilters}
        onOpenFilters={() => setDrawerOpen(true)}
        filtersOpen={drawerOpen}
        drawerId={DRAWER_ID}
        onClear={clearFilters}
        canClear={hasFilters}
      />

      {!isHistory && <SortField id="my-orders-sort" value={sort} onChange={setSort} options={MY_ORDERS_SORT_OPTIONS} />}

      <div id="my-orders-panel" role="tabpanel" aria-labelledby={`my-orders-tab-${tab}`} className="flex flex-col gap-6">
        {list}
        {!loading && orders.length < totalCount && (
          <div className="flex flex-col items-center gap-2.5">
            <p className="text-sm text-neutral-600">{t("common.showingOf", { shown: orders.length, total: totalCount })}</p>
            <button
              type="button"
              onClick={loadMore}
              disabled={fetching}
              className="h-11 cursor-pointer rounded-full border border-brand-800 bg-white px-6 text-[15px] font-bold text-brand-800 hover:bg-brand-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-wait disabled:opacity-60"
            >
              {fetching ? t("common.loading") : t("myOrders.showMore")}
            </button>
          </div>
        )}
      </div>

      {drawerOpen && (
        <FilterDrawer id={DRAWER_ID} onClose={() => setDrawerOpen(false)} onClear={clearFilters} canClear={hasFilters}>
          <FilterPills
            label={t("myOrders.filters.methodLabel")}
            options={METHODS.map((value) => ({
              value,
              label: methodLabel(value),
              icon: value === "pickup" ? ShoppingBag : value === "delivery" ? ScooterIcon : undefined,
            }))}
            value={method}
            onChange={setMethod}
          />
          <FilterPills
            label={t("myOrders.filters.statusLabel")}
            options={(["", ...(isHistory ? HISTORY_STATUSES : ACTIVE_STATUSES)] as ("" | OrderStatus)[]).map((value) => ({
              value,
              label: statusLabel(value),
            }))}
            value={status}
            onChange={setStatus}
          />
          {isHistory && (
            <FilterPills
              label={t("myOrders.filters.periodLabel")}
              options={PERIODS.map((value) => ({ value, label: periodLabel(value) }))}
              value={period}
              onChange={setPeriod}
            />
          )}
        </FilterDrawer>
      )}

      {cancelOrder.modal}
    </div>
  );
}

export default MyOrdersPage;
