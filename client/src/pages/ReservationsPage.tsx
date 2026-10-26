import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CalendarCheck,
  CalendarX,
  Check,
  CircleDot,
  MapPin,
  PackageCheck,
  Search,
  SearchX,
  X,
  XCircle,
} from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import DashboardReservationCard from "../components/dashboard/DashboardReservationCard.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../components/product/FilterBar.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import ConfirmModal from "../components/common/ConfirmModal.js";
import AcceptReservationModal from "../components/reservation/AcceptReservationModal.js";
import { inputStyle } from "../components/form/FormField.js";
import PickupConfirmModal from "../components/pickup/PickupConfirmModal.js";
import LoadMore from "../components/LoadMore.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { CARD_PAGE_SIZE } from "../utils/pagination.js";
import { usePickupActions } from "../hooks/usePickupActions.js";
import type { Reservation } from "../types/index.js";

function ReservationsPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [city, setCity] = useState("");
  const [acceptingReservation, setAcceptingReservation] =
    useState<Reservation | null>(null);
  const [rejectingReservation, setRejectingReservation] =
    useState<Reservation | null>(null);
  // The reservation whose accept or reject request is in flight; blocks double clicks.
  const [busyId, setBusyId] = useState<number | null>(null);
  const { t } = useTranslation();
  // 12 at a time; a filter change starts again from the first page, a reload keeps the limit.
  const filters = { name, status, city };
  const { limit, loadMore } = usePagedLimit(CARD_PAGE_SIZE, JSON.stringify(filters));
  const {
    data: reservationsList,
    total,
    error,
    loading,
    fetching,
    refetch,
  } = useFetch<Reservation>("/reservations/store", "reservations", { ...filters, limit });

  const pickupActions = usePickupActions(refetch);

  const handleAccept = async (reservationId: number) => {
    if (busyId !== null) return;
    setBusyId(reservationId);
    try {
      const response = await api.patch(`/reservations/${reservationId}/accept`);
      toast.success(response.data.message);
      setAcceptingReservation(null);
      refetch();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("reservations.actionError"));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (reservationId: number) => {
    if (busyId !== null) return;
    setBusyId(reservationId);
    try {
      const response = await api.patch(`/reservations/${reservationId}/reject`);
      toast.success(response.data.message);
      setRejectingReservation(null);
      refetch();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("reservations.actionError"));
    } finally {
      setBusyId(null);
    }
  };

  const clearFilters = () => {
    setName("");
    setStatus("");
    setCity("");
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters = Boolean(name || status || city);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <ProductPageHeader
        title={t("reservations.title")}
        subtitle={t("reservations.storeSubtitle")}
        icon={CalendarCheck}
        count={t("reservations.count", { count: total ?? reservationsList.length })}
      />

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters} columns={3}>
        <FilterField icon={Search}>
          <input
            type="text"
            placeholder={t("filters.searchByName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={MapPin}>
          <input
            type="text"
            placeholder={t("filters.searchByCity")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={CircleDot}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("filters.selectResStatus")}</option>
            <option value="Pending">{t("reservationStatus.Pending")}</option>
            <option value="Confirmed">{t("reservationStatus.Confirmed")}</option>
            <option value="Completed">{t("reservationStatus.Completed")}</option>
            <option value="Rejected">{t("reservationStatus.Rejected")}</option>
            <option value="Cancelled">{t("reservationStatus.Cancelled")}</option>
          </select>
        </FilterField>
      </FilterBar>

      {error && reservationsList.length === 0 ? (
        <LoadErrorState />
      ) : reservationsList.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={SearchX}
            title={t("reservations.noResultsTitle")}
            subtitle={t("reservations.noResultsSubtitle")}
          />
        ) : (
          <EmptyState
            icon={CalendarCheck}
            title={t("reservations.noReservationsTitle")}
            subtitle={t("reservations.noReservationsSubtitle")}
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {reservationsList.map((reservation) => (
            <DashboardReservationCard
              key={reservation.id}
              reservation={reservation}
              partyLabel={t("reservations.buyer")}
              actions={
                reservation.status === "Pending" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setAcceptingReservation(reservation)}
                      disabled={busyId === reservation.id}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-600/20 transition-colors hover:bg-green-700 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Check className="h-4 w-4" />
                      {t("reservations.acceptButton")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectingReservation(reservation)}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                      {t("reservations.rejectButton")}
                    </button>
                    <Link
                      to={`/reservation/${reservation.id}`}
                      title={t("dashboard.detailsButton")}
                      aria-label={t("dashboard.detailsButton")}
                      className="inline-flex items-center justify-center rounded-xl bg-orange-50 px-3 text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </>
                ) : reservation.status === "Confirmed" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => pickupActions.request("complete", reservation)}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-600/20 transition-colors hover:bg-green-700"
                    >
                      <PackageCheck className="h-4 w-4" />
                      {t("pickups.completeButton")}
                    </button>
                    {reservation.is_overdue && (
                      <button
                        type="button"
                        onClick={() => pickupActions.request("cancel-overdue", reservation)}
                        className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        <CalendarX className="h-4 w-4" />
                        {t("pickups.cancelOverdueButton")}
                      </button>
                    )}
                    <Link
                      to={`/reservation/${reservation.id}`}
                      title={t("dashboard.detailsButton")}
                      aria-label={t("dashboard.detailsButton")}
                      className="inline-flex items-center justify-center rounded-xl bg-orange-50 px-3 text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      <LoadMore
        shown={reservationsList.length}
        total={total ?? reservationsList.length}
        fetching={fetching}
        onLoadMore={loadMore}
      />

      {pickupActions.pending && (
        <PickupConfirmModal
          {...pickupActions.pending}
          busy={pickupActions.busy}
          onClose={pickupActions.close}
          onConfirm={pickupActions.confirm}
        />
      )}

      {acceptingReservation && (
        <AcceptReservationModal
          reservation={acceptingReservation}
          restaurant={acceptingReservation.business_name ?? ""}
          busy={busyId === acceptingReservation.id}
          onConfirm={() => handleAccept(acceptingReservation.id)}
          onClose={() => setAcceptingReservation(null)}
        />
      )}

      {rejectingReservation && (
        <ConfirmModal
          variant="danger"
          icon={XCircle}
          title={t("reservations.rejectConfirmation")}
          message={t("reservations.rejectConfirmationText", {
            product: rejectingReservation.product_name,
            business: rejectingReservation.business_name,
          })}
          confirmLabel={t("reservations.rejectButton")}
          cancelLabel={t("reservations.keepButton")}
          busy={busyId === rejectingReservation.id}
          onConfirm={() => handleReject(rejectingReservation.id)}
          onClose={() => setRejectingReservation(null)}
        />
      )}
    </div>
  );
}

export default ReservationsPage;
