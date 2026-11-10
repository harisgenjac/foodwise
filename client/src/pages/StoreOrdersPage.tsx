import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarX, CircleDot, ReceiptText, Hash, MapPin, PackageCheck, Scale, Search, SearchX } from "lucide-react";
import LoadingSpinner from "../components/LoadingSpinner.js";
import OrderCard from "../components/order/OrderCard.js";
import OrderDecisionModal from "../components/order/OrderDecisionModal.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../components/product/FilterBar.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import { inputStyle } from "../components/form/FormField.js";
import CitySelect from "../components/form/CitySelect.js";
import PickupConfirmModal from "../components/pickup/PickupConfirmModal.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import { usePickupActions } from "../hooks/usePickupActions.js";
import type { Order } from "../types/index.js";

const STATUSES: Order["status"][] = ["Pending", "Confirmed", "Completed", "Rejected", "Cancelled"];

const detailsLinkStyle =
  "inline-flex items-center justify-center rounded-xl bg-orange-50 px-3 text-orange-700 transition-colors hover:bg-orange-500 hover:text-white";

// The store's orders, Pending first: decide a new one, hand over or cancel a missed pickup.
function StoreOrdersPage() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [cityId, setCityId] = useState("");
  const [deciding, setDeciding] = useState<Order | null>(null);
  const { t } = useTranslation();
  // 12 at a time; a filter change starts again from the first page, a reload keeps the limit.
  // The code is searched without its "#".
  const filters = { name, code: code.replace(/^#/, "").trim(), status, city_id: cityId };
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, JSON.stringify(filters));
  const { data: orders, total, error, loading, fetching, refetch } = useFetch<Order>("/orders/store", "orders", {
    ...filters,
    limit,
  });

  const pickupActions = usePickupActions(refetch);

  const clearFilters = () => {
    setName("");
    setCode("");
    setStatus("");
    setCityId("");
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters = Boolean(name || code || status || cityId);
  const details = (order: Order) => (
    <Link
      to={`/orders/${order.id}`}
      title={t("dashboard.detailsButton")}
      aria-label={t("dashboard.detailsButton")}
      className={detailsLinkStyle}
    >
      <ArrowRight className="h-4 w-4" />
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <ProductPageHeader
        title={t("orders.storeTitle")}
        subtitle={t("orders.storeSubtitle")}
        icon={ReceiptText}
        count={t("orders.count", { count: total ?? orders.length })}
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        activeCount={[code, status, cityId].filter(Boolean).length}
        resultCount={total ?? undefined}
        onClear={clearFilters}
        columns={3}
        search={
          <FilterField icon={Search}>
            <input
              type="text"
              placeholder={t("orders.searchProduct")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputStyle}
            />
          </FilterField>
        }
      >
        <FilterField icon={Hash}>
          <input
            type="text"
            aria-label={t("orders.searchCode")}
            placeholder={t("orders.searchCode")}
            maxLength={5}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9#]/g, ""))}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={MapPin}>
          <CitySelect
            value={cityId}
            onChange={setCityId}
            emptyLabel={t("cities.all")}
            aria-label={t("cities.label")}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={CircleDot}>
          <select
            aria-label={t("orders.selectStatus")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("orders.selectStatus")}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`reservationStatus.${value}`)}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {error && orders.length === 0 ? (
        <LoadErrorState />
      ) : orders.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState icon={SearchX} title={t("orders.noResultsTitle")} subtitle={t("orders.noResultsSubtitle")} />
        ) : (
          <EmptyState icon={ReceiptText} title={t("orders.storeEmptyTitle")} subtitle={t("orders.storeEmptySubtitle")} />
        )
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              partyLabel={t("reservations.buyer")}
              actions={
                order.status === "Pending" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setDeciding(order)}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-600/20 transition-colors hover:bg-green-700"
                    >
                      <Scale className="h-4 w-4" />
                      {t("orders.decideButton")}
                    </button>
                    {details(order)}
                  </>
                ) : order.status === "Confirmed" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => pickupActions.request("complete", order)}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-600/20 transition-colors hover:bg-green-700"
                    >
                      <PackageCheck className="h-4 w-4" />
                      {t("pickups.completeButton")}
                    </button>
                    {order.is_overdue && (
                      <button
                        type="button"
                        onClick={() => pickupActions.request("cancel-overdue", order)}
                        className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        <CalendarX className="h-4 w-4" />
                        {t("pickups.cancelOverdueButton")}
                      </button>
                    )}
                    {details(order)}
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      <LoadMore shown={orders.length} total={total ?? orders.length} fetching={fetching} onLoadMore={loadMore} />

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
          order={deciding}
          restaurant={deciding.business_name ?? ""}
          onClose={() => setDeciding(null)}
          onDecided={refetch}
        />
      )}
    </div>
  );
}

export default StoreOrdersPage;
