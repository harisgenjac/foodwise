import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  PackageCheck,
  PackageOpen,
  Search,
  SearchX,
} from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import { FilterField } from "../components/product/FilterBar.js";
import { inputStyle } from "../components/form/FormField.js";
import PickupCard from "../components/pickup/PickupCard.js";
import PickupConfirmModal from "../components/pickup/PickupConfirmModal.js";
import { useAuth } from "../context/AuthContext.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import { usePickupActions } from "../hooks/usePickupActions.js";
import { daysFromToday, toDateInput } from "../utils/expiry.js";
import type { Reservation } from "../types/index.js";

type Scope = "today" | "upcoming" | "completed";

interface PickupCounts {
  today: number;
  overdue: number;
  upcoming: number;
  completed: number;
}

interface PickupGroup {
  key: string;
  title: string;
  overdue?: boolean;
  items: Reservation[];
}

// "Today", "Tomorrow", "Yesterday" or "Wednesday, 22 October" (names from i18n, browsers lack Bosnian ones).
const dayTitle = (dateInput: string, t: TFunction) => {
  const offset = daysFromToday(dateInput);
  if (offset === 0) return t("pickups.sections.today");
  if (offset === 1) return t("pickups.sections.tomorrow");
  if (offset === -1) return t("notifications.groups.yesterday");
  const date = new Date(`${dateInput}T00:00:00`);
  const weekdays = t("dashboard.weekdays", { returnObjects: true }) as string[];
  const months = t("dashboard.months", { returnObjects: true }) as string[];
  return t("dashboard.dateFormat", {
    weekday: weekdays[date.getDay()],
    day: date.getDate(),
    month: months[date.getMonth()],
  });
};

// Groups an already sorted list by local day, keeping the server order inside each day.
const groupByDay = (items: Reservation[], dateOf: (r: Reservation) => string, t: TFunction): PickupGroup[] => {
  const groups: PickupGroup[] = [];
  for (const item of items) {
    const key = toDateInput(new Date(dateOf(item)));
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, title: dayTitle(key, t), items: [item] });
    }
  }
  return groups;
};

function PickupsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isStore = user?.role === "STORE";
  const [scope, setScope] = useState<Scope>("today");
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<PickupCounts | null>(null);

  // Only the picked-up history is paged (12 at a time); today and upcoming always come whole, so
  // a late pickup never hides behind "Load more".
  const isHistory = scope === "completed";
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, `${scope}-${name}`);
  const {
    data: pickups,
    total,
    loading,
    fetching,
    error,
    refetch,
  } = useFetch<Reservation>("/reservations/pickups", "reservations", {
    scope,
    name,
    ...(isHistory && { limit }),
  });

  const fetchCounts = useCallback(async () => {
    try {
      const response = await api.get("/reservations/pickups/counts");
      setCounts(response.data.counts);
    } catch (err) {
      console.error("Error fetching pickup counts:", err);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const actions = usePickupActions(() => {
    refetch();
    fetchCounts();
  });

  if (loading) {
    return <LoadingSpinner />;
  }

  const tabs: { key: Scope; label: string; icon: typeof CalendarClock; count?: number }[] = [
    { key: "today", label: t("pickups.tabs.today"), icon: CalendarClock, ...(counts && { count: counts.today }) },
    { key: "upcoming", label: t("pickups.tabs.upcoming"), icon: CalendarDays, ...(counts && { count: counts.upcoming }) },
    { key: "completed", label: t("pickups.tabs.completed"), icon: PackageCheck, ...(counts && { count: counts.completed }) },
  ];

  let groups: PickupGroup[];
  if (scope === "today") {
    const overdue = pickups.filter((r) => r.is_overdue);
    const onTime = pickups.filter((r) => !r.is_overdue);
    groups = [
      { key: "overdue", title: t("pickups.sections.overdue"), overdue: true, items: overdue },
      { key: "today", title: t("pickups.sections.today"), items: onTime },
    ].filter((group) => group.items.length > 0);
  } else if (scope === "upcoming") {
    groups = groupByDay(pickups, (r) => r.pickup_date, t);
  } else {
    groups = groupByDay(pickups, (r) => r.picked_up_at ?? r.updated_at, t);
  }

  const emptyState = {
    today: {
      icon: CalendarClock,
      title: t("pickups.empty.todayTitle"),
      subtitle: isStore ? t("pickups.empty.todayStoreSubtitle") : t("pickups.empty.todayRestaurantSubtitle"),
    },
    upcoming: { icon: CalendarDays, title: t("pickups.empty.upcomingTitle"), subtitle: t("pickups.empty.upcomingSubtitle") },
    completed: { icon: PackageOpen, title: t("pickups.empty.completedTitle"), subtitle: t("pickups.empty.completedSubtitle") },
  }[scope];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <ProductPageHeader
        title={t("pickups.title")}
        subtitle={isStore ? t("pickups.storeSubtitle") : t("pickups.restaurantSubtitle")}
        icon={PackageCheck}
        {...(counts && { count: t("pickups.todayCount", { count: counts.today }) })}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" className="inline-flex w-fit flex-wrap rounded-full border border-gray-100 bg-white p-1 shadow-sm">
          {tabs.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scope === key}
              onClick={() => setScope(key)}
              className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                scope === key ? "bg-orange-500 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              {label}
              {!!count && (
                <span
                  className={`rounded-full px-1.5 text-xs font-semibold ${
                    scope === key ? "bg-white/25 text-white" : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {count}
                </span>
              )}
              {key === "today" && !!counts?.overdue && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
              )}
            </button>
          ))}
        </div>

        <div className="sm:w-72">
          <FilterField icon={Search}>
            <input
              type="text"
              placeholder={t("pickups.searchPlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputStyle}
            />
          </FilterField>
        </div>
      </div>

      {error && pickups.length === 0 ? (
        <LoadErrorState />
      ) : groups.length === 0 ? (
        name ? (
          <EmptyState icon={SearchX} title={t("pickups.empty.noResultsTitle")} subtitle={t("pickups.empty.noResultsSubtitle")} />
        ) : (
          <EmptyState icon={emptyState.icon} title={emptyState.title} subtitle={emptyState.subtitle} />
        )
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <h2
              className={`mb-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide ${
                group.overdue ? "text-red-600" : "text-gray-400"
              }`}
            >
              {group.overdue && <AlertTriangle className="h-4 w-4" />}
              {group.title}
              {/* A day of the paged history may continue on the next page, so it has no count. */}
              {!isHistory && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                    group.overdue ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {group.items.length}
                </span>
              )}
            </h2>
            <div className="flex flex-col gap-3">
              {group.items.map((reservation) => (
                <PickupCard
                  key={reservation.id}
                  reservation={reservation}
                  isStore={isStore}
                  onComplete={(r) => actions.request("complete", r)}
                  onCancelOverdue={(r) => actions.request("cancel-overdue", r)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {isHistory && (
        <LoadMore
          shown={pickups.length}
          total={total ?? pickups.length}
          fetching={fetching}
          onLoadMore={loadMore}
        />
      )}

      {actions.pending && (
        <PickupConfirmModal
          {...actions.pending}
          busy={actions.busy}
          onClose={actions.close}
          onConfirm={actions.confirm}
        />
      )}
    </div>
  );
}

export default PickupsPage;
