import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { CalendarCheck, Ban, ListFilter, Search, X } from "lucide-react";
import api from "../../api/axios.js";
import { useFetch } from "../../hooks/useFetch.js";
import { useAdminPage, useKeepPageInRange } from "../../hooks/useAdminPage.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Pagination from "../../components/admin/Pagination.js";
import ReasonModal from "../../components/admin/ReasonModal.js";
import { RESERVATION_STATUS_STYLES } from "../../utils/reservationStatus.js";
import { ADMIN_PAGE_SIZE, formatDateTime } from "../../utils/admin.js";
import type { AdminReservation } from "../../types/index.js";

// Only reservations that are still open can be cancelled by an admin.
const CANCELLABLE: AdminReservation["status"][] = ["Pending", "Confirmed"];

function AdminReservationsPage() {
  const { t } = useTranslation();
  // Set when coming from a user's page ("User's reservations").
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get("user_id") ?? "";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { page, offset, setPage } = useAdminPage();
  const [selected, setSelected] = useState<AdminReservation | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: reservations, total, loading, error, refetch } = useFetch<AdminReservation>(
    "/admin/reservations",
    "reservations",
    { q, status, user_id: userId, limit: ADMIN_PAGE_SIZE, offset },
  );
  useKeepPageInRange(page, total, setPage);

  const statuses = t("reservationStatus", { returnObjects: true }) as Record<string, string>;
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const hasActiveFilters = Boolean(q || status);

  const cancelReservation = async (reason: string) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api.post(`/admin/reservations/${selected.id}/cancel`, { reason });
      toast.success(t("admin.reservations.cancelled"));
      setSelected(null);
      refetch();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("admin.common.actionError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("admin.reservations.title")}
        subtitle={t("admin.reservations.subtitle")}
        icon={CalendarCheck}
        count={total === null ? undefined : t("admin.reservations.count", { count: total })}
      />

      {userId && (
        <p className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-2 text-sm text-orange-800">
          {t("admin.reservations.filteredByUser")}
          <button
            type="button"
            onClick={() => {
              setSearchParams({});
            }}
            className="inline-flex cursor-pointer items-center gap-1 font-medium hover:underline"
          >
            <X className="h-4 w-4" />
            {t("admin.reservations.showAll")}
          </button>
        </p>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setQ("");
          setStatus("");
          setPage(1);
        }}
        columns={3}
      >
        <FilterField icon={Search}>
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={t("admin.reservations.search")}
            aria-label={t("admin.reservations.search")}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={ListFilter}>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label={t("admin.reservations.columnStatus")}
            className={inputStyle}
          >
            <option value="">{t("admin.reservations.allStatuses")}</option>
            {Object.entries(statuses).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <LoadErrorState />
      ) : reservations.length === 0 ? (
        hasActiveFilters || userId ? (
          <EmptyState
            icon={CalendarCheck}
            title={t("admin.reservations.noResultsTitle")}
            subtitle={t("admin.reservations.noResultsSubtitle")}
          />
        ) : (
          <EmptyState icon={CalendarCheck} title={t("admin.reservations.emptyTitle")} subtitle={t("admin.reservations.emptySubtitle")} />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("admin.reservations.columnProduct")}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t("admin.reservations.columnStore")}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t("admin.reservations.columnRestaurant")}</th>
                  <th className="hidden px-4 py-3 lg:table-cell">{t("admin.reservations.columnPickup")}</th>
                  <th className="px-4 py-3">{t("admin.reservations.columnStatus")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{reservation.product_name}</p>
                      <p className="text-xs text-gray-500">
                        {parseFloat(reservation.quantity)} {units[reservation.unit] || reservation.unit}
                        {" · "}#{reservation.id}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Link to={`/admin/users/${reservation.store_id}`} className="text-gray-700 hover:text-orange-600">
                        {reservation.store_name || reservation.store_email}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Link to={`/admin/users/${reservation.restaurant_id}`} className="text-gray-700 hover:text-orange-600">
                        {reservation.restaurant_name || reservation.restaurant_email}
                      </Link>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-600 lg:table-cell">
                      {formatDateTime(reservation.pickup_date)}
                      {reservation.is_overdue && (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                          {t("admin.reservations.late")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${RESERVATION_STATUS_STYLES[reservation.status]}`}>
                        {statuses[reservation.status] || reservation.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {CANCELLABLE.includes(reservation.status) && (
                        <button
                          type="button"
                          onClick={() => setSelected(reservation)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                        >
                          <Ban className="h-4 w-4" />
                          {t("admin.reservations.cancel")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
        </>
      )}

      {selected && (
        <ReasonModal
          title={t("admin.reservations.cancelTitle")}
          text={t(
            selected.status === "Confirmed"
              ? "admin.reservations.cancelTextConfirmed"
              : "admin.reservations.cancelTextPending",
            { name: selected.product_name },
          )}
          confirmLabel={t("admin.reservations.cancel")}
          busy={busy}
          onConfirm={cancelReservation}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default AdminReservationsPage;
