import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  CircleDot,
  History,
  Search,
  SearchX,
  ShoppingBasket,
  Store,
  X,
  XCircle,
} from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import DashboardReservationCard from "../components/dashboard/DashboardReservationCard.js";
import ReservationHistoryRow from "../components/reservation/ReservationHistoryRow.js";
import ProductPageHeader, { CountPill } from "../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../components/product/FilterBar.js";
import SortSelect, {
  MY_RESERVATIONS_SORT_OPTIONS,
  ResultsBar,
  type MyReservationsSort,
} from "../components/product/SortSelect.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import ConfirmModal from "../components/common/ConfirmModal.js";
import { inputStyle } from "../components/form/FormField.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE, HISTORY_PAGE_SIZE } from "../utils/pagination.js";
import { groupByDay } from "../utils/dayGroups.js";
import type { Reservation } from "../types/index.js";

type Tab = "active" | "history";
type Status = Reservation["status"];

const STATUSES: Status[] = ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"];
// The statuses a reservation on the Active tab can have.
const ACTIVE_STATUSES: Status[] = ["Pending", "Confirmed"];
const PERIODS = [
  { value: "today", label: "reservations.period.today" },
  { value: "7d", label: "reservations.period.last7Days" },
  { value: "month", label: "reservations.period.thisMonth" },
];

// The tab counts: every reservation (History) and every active one (Active), without filters.
interface ReservationSummary {
  total: number;
  active: number;
}

function MyReservationsPage() {
  const [tab, setTab] = useState<Tab>("active");
  // Each tab has its own filters, so a tab switch resets them.
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  // Only on History.
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  // Only on Active; History is always newest first.
  const [sort, setSort] = useState<MyReservationsSort>("newest");
  const [summary, setSummary] = useState<ReservationSummary | null>(null);
  const [cancellingReservation, setCancellingReservation] =
    useState<Reservation | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { t } = useTranslation();

  const isHistory = tab === "history";
  const filters = { name, business_name: businessName, status };
  const query = isHistory
    ? { scope: "all", sort: "newest", ...filters, period }
    : { scope: "active", sort, ...filters };
  // Active loads 12 cards at a time, History 20 rows; a tab, sort or filter change starts again
  // from the first page, a reload keeps the limit.
  const { limit, loadMore } = usePagedLimit(
    isHistory ? HISTORY_PAGE_SIZE : CARD_PAGE_SIZE,
    JSON.stringify(query),
  );
  const {
    data: reservationsList,
    total,
    error,
    loading,
    fetching,
    refetch,
  } = useFetch<Reservation>("/reservations/mine", "reservations", { ...query, limit });

  const fetchSummary = useCallback(async () => {
    try {
      const response = await api.get("/reservations/mine/summary");
      setSummary(response.data.summary);
    } catch (err) {
      console.error("Error fetching the reservation summary:", err);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // The tab and the sort are not filters, so they stay.
  const clearFilters = () => {
    setName("");
    setBusinessName("");
    setPeriod("");
    setStatus("");
  };

  const switchTab = (next: Tab) => {
    if (next !== tab) clearFilters();
    setTab(next);
  };

  const handleCancellation = async (reservationId: number) => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const response = await api.patch(`/reservations/${reservationId}/cancel`);
      toast.success(response.data.message);
      setCancellingReservation(null);
      refetch();
      fetchSummary();
    } catch (err) {
      console.error("Error canceling reservation:", err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("reservations.actionError"));
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters = Boolean(name || businessName || status || period);
  const totalCount = total ?? reservationsList.length;

  const tabs: { key: Tab; label: string; icon: typeof CalendarClock; count?: number }[] = [
    { key: "active", label: t("reservations.tabs.active"), icon: CalendarClock, ...(summary && { count: summary.active }) },
    { key: "history", label: t("reservations.tabs.history"), icon: History, ...(summary && { count: summary.total }) },
  ];

  const noResults = (
    <EmptyState
      icon={SearchX}
      title={t("reservations.noResultsTitle")}
      subtitle={t("reservations.noResultsSubtitle")}
    />
  );

  let list;
  if (error && reservationsList.length === 0) {
    list = <LoadErrorState />;
  } else if (reservationsList.length === 0) {
    if (hasActiveFilters) {
      list = noResults;
    } else if (isHistory) {
      list = (
        <EmptyState
          icon={CalendarCheck}
          title={t("reservations.noCreatedResTitle")}
          subtitle={t("reservations.noCreatedResSubtitle")}
          action={{ to: "/browse-products", label: t("dashboard.browseOffers") }}
        />
      );
    } else {
      list = (
        <EmptyState
          icon={CalendarClock}
          title={t("reservations.emptyActiveTitle")}
          subtitle={t("reservations.emptyActiveSubtitle")}
          action={{ to: "/browse-products", label: t("dashboard.browseOffers") }}
          secondaryAction={{ label: t("reservations.showHistory"), onClick: () => switchTab("history") }}
        />
      );
    }
  } else if (isHistory) {
    list = groupByDay(reservationsList, (r) => r.created_at, t).map((group) => (
      <section key={group.key}>
        {/* A day may continue on the next page, so the heading has no count. */}
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{group.title}</h2>
        <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {group.items.map((reservation) => (
            <ReservationHistoryRow key={reservation.id} reservation={reservation} />
          ))}
        </div>
      </section>
    ));
  } else {
    list = (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {reservationsList.map((reservation) => (
          <DashboardReservationCard
            key={reservation.id}
            reservation={reservation}
            partyLabel={t("reservations.seller")}
            showCreatedAt
            linkStore
            actions={
              reservation.status === "Pending" ? (
                <>
                  <Link
                    to={`/reservation/${reservation.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
                  >
                    {t("dashboard.detailsButton")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setCancellingReservation(reservation)}
                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                    {t("reservations.cancelShortButton")}
                  </button>
                </>
              ) : undefined
            }
          />
        ))}
      </div>
    );
  }

  const countText = t("reservations.count", { count: totalCount });

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <ProductPageHeader
        title={t("reservations.title")}
        subtitle={t("reservations.restaurantSubtitle")}
        icon={CalendarCheck}
        action={{ to: "/browse-products", label: t("dashboard.browseOffers"), icon: ShoppingBasket }}
      />

      <div role="tablist" className="inline-flex w-fit flex-wrap rounded-full border border-gray-100 bg-white p-1 shadow-sm">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? "bg-orange-500 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.8} />
            {label}
            {!!count && (
              <span
                className={`rounded-full px-1.5 text-xs font-semibold ${
                  tab === key ? "bg-white/25 text-white" : "bg-orange-100 text-orange-700"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters} columns={isHistory ? 4 : 3}>
        <FilterField icon={Search}>
          <input
            type="text"
            placeholder={t("filters.searchByName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={Store}>
          <input
            type="text"
            placeholder={t("filters.searchByStore")}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={inputStyle}
          />
        </FilterField>
        {isHistory && (
          <FilterField icon={CalendarRange}>
            <select
              aria-label={t("reservations.period.all")}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className={inputStyle}
            >
              <option value="">{t("reservations.period.all")}</option>
              {PERIODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </FilterField>
        )}
        <FilterField icon={CircleDot}>
          <select
            aria-label={t("filters.selectResStatus")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("filters.selectResStatus")}</option>
            {(isHistory ? STATUSES : ACTIVE_STATUSES).map((value) => (
              <option key={value} value={value}>
                {t(`reservationStatus.${value}`)}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {isHistory ? (
        <CountPill>{countText}</CountPill>
      ) : (
        <ResultsBar count={countText}>
          <SortSelect value={sort} onChange={setSort} options={MY_RESERVATIONS_SORT_OPTIONS} />
        </ResultsBar>
      )}

      {list}

      <LoadMore
        shown={reservationsList.length}
        total={totalCount}
        fetching={fetching}
        onLoadMore={loadMore}
      />

      {cancellingReservation && (
        <ConfirmModal
          variant="danger"
          icon={XCircle}
          title={t("reservations.cancelConfirmation")}
          message={t("reservations.cancelConfirmationText", {
            product: cancellingReservation.product_name,
            business: cancellingReservation.business_name,
          })}
          confirmLabel={t("reservations.cancelButton")}
          cancelLabel={t("reservations.keepButton")}
          busy={cancelling}
          onConfirm={() => handleCancellation(cancellingReservation.id)}
          onClose={() => setCancellingReservation(null)}
        />
      )}
    </div>
  );
}

export default MyReservationsPage;
