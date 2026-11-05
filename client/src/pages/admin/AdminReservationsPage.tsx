import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { CalendarCheck, Ban, ListFilter, Search, X } from "lucide-react";
import api from "../../api/axios.js";
import { useFetch } from "../../hooks/useFetch.js";
import { useAdminPage, useAdminSort, useKeepPageInRange } from "../../hooks/useAdminPage.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Pagination from "../../components/admin/Pagination.js";
import DataTable, { type DataColumn } from "../../components/common/DataTable.js";
import ConfirmModal from "../../components/common/ConfirmModal.js";
import { RESERVATION_STATUS_STYLES } from "../../utils/reservationStatus.js";
import { ADMIN_PAGE_SIZE, formatDateTime } from "../../utils/admin.js";
import type { AdminReservation } from "../../types/index.js";

// Only reservations that are still open can be cancelled by an admin.
const CANCELLABLE: AdminReservation["status"][] = ["Pending", "Confirmed"];

// Sortable columns (the server whitelist of GET /admin/reservations).
const SORT_KEYS = ["pickup_date"];

function AdminReservationsPage() {
  const { t } = useTranslation();
  // Set when coming from a user's page ("User's reservations").
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get("user_id") ?? "";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { page, offset, setPage } = useAdminPage();
  const { sort, dir, toggleSort, setSort } = useAdminSort(SORT_KEYS);
  const [selected, setSelected] = useState<AdminReservation | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: reservations, total, loading, error, refetch } = useFetch<AdminReservation>(
    "/admin/reservations",
    "reservations",
    { q, status, user_id: userId, sort, dir, limit: ADMIN_PAGE_SIZE, offset },
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

  const cancelButton = (reservation: AdminReservation, card: boolean) =>
    CANCELLABLE.includes(reservation.status) && (
      <button
        type="button"
        onClick={() => setSelected(reservation)}
        className={
          card
            ? "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
            : "inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        }
      >
        <Ban className="h-4 w-4" />
        {t("admin.reservations.cancel")}
      </button>
    );
  // Phone cards: the product (quantity, number) and its status, the store, the restaurant and the
  // pickup time, and Cancel as a full-width button.
  const columns: DataColumn<AdminReservation>[] = [
    {
      id: "product",
      header: t("admin.reservations.columnProduct"),
      card: "title",
      cell: (reservation) => (
        <>
          <p className="font-medium text-gray-900">{reservation.product_name}</p>
          <p className="text-xs text-gray-500">
            {parseFloat(reservation.quantity)} {units[reservation.unit] || reservation.unit}
            {" · "}#{reservation.id}
          </p>
        </>
      ),
    },
    {
      id: "store",
      header: t("admin.reservations.columnStore"),
      className: "hidden md:table-cell",
      cell: (reservation) => (
        <Link to={`/admin/users/${reservation.store_id}`} className="text-gray-700 hover:text-orange-600">
          {reservation.store_name || reservation.store_email}
        </Link>
      ),
    },
    {
      id: "restaurant",
      header: t("admin.reservations.columnRestaurant"),
      className: "hidden md:table-cell",
      cell: (reservation) => (
        <Link to={`/admin/users/${reservation.restaurant_id}`} className="text-gray-700 hover:text-orange-600">
          {reservation.restaurant_name || reservation.restaurant_email}
        </Link>
      ),
    },
    {
      id: "pickup",
      header: t("admin.reservations.columnPickup"),
      sortKey: "pickup_date",
      className: "hidden lg:table-cell",
      cellClassName: "whitespace-nowrap text-gray-600",
      cell: (reservation) => (
        <>
          {formatDateTime(reservation.pickup_date)}
          {reservation.is_overdue && (
            <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
              {t("admin.reservations.late")}
            </span>
          )}
        </>
      ),
    },
    {
      id: "status",
      header: t("admin.reservations.columnStatus"),
      card: "status",
      cell: (reservation) => (
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${RESERVATION_STATUS_STYLES[reservation.status]}`}
        >
          {statuses[reservation.status] || reservation.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      card: "actions",
      cellClassName: "text-right",
      cell: (reservation) => cancelButton(reservation, false),
      cardCell: (reservation) => cancelButton(reservation, true),
    },
  ];

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
        activeCount={[status].filter(Boolean).length}
        resultCount={total ?? undefined}
        onClear={() => {
          setQ("");
          setStatus("");
          setPage(1);
        }}
        columns={3}
        search={
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
        }
      >
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
          <DataTable
            label={t("admin.reservations.title")}
            rows={reservations}
            rowKey={(reservation) => reservation.id}
            sort={{ sort, dir, onSort: toggleSort, setSort }}
            columns={columns}
          />
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
        </>
      )}

      {selected && (
        <ConfirmModal
          variant="danger"
          reason
          title={t("admin.reservations.cancelTitle")}
          message={t(
            selected.status === "Confirmed"
              ? "admin.reservations.cancelTextConfirmed"
              : "admin.reservations.cancelTextPending",
            { name: selected.product_name },
          )}
          confirmLabel={t("admin.reservations.cancel")}
          cancelLabel={t("admin.common.cancel")}
          busy={busy}
          onConfirm={cancelReservation}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default AdminReservationsPage;
