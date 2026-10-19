import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CalendarCheck,
  CircleDot,
  Search,
  SearchX,
  ShoppingBasket,
  Store,
  X,
  XCircle,
} from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import DashboardReservationCard from "../components/dashboard/DashboardReservationCard.jsx";
import ProductPageHeader from "../components/product/ProductPageHeader.jsx";
import FilterBar, { FilterField } from "../components/product/FilterBar.jsx";
import EmptyState from "../components/product/EmptyState.jsx";
import Modal from "../components/product/Modal.jsx";
import { inputStyle } from "../components/form/FormField.jsx";
import { useFetch } from "../hooks/useFetch.js";
import type { Reservation } from "../types/index.js";

function MyReservationsPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [cancellingReservation, setCancellingReservation] =
    useState<Reservation | null>(null);
  const { t } = useTranslation();
  const {
    data: reservationsList,
    loading,
    refetch,
  } = useFetch<Reservation>("/reservations/mine", "reservations", {
    name,
    status,
    business_name: businessName,
  });

  const handleCancellation = async (reservationId: number) => {
    try {
      const response = await api.patch(`/reservations/${reservationId}/cancel`);
      toast.success(response.data.message);
      setCancellingReservation(null);
      refetch();
    } catch (err) {
      console.error("Error canceling reservation:", err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("reservations.actionError"));
    }
  };

  const clearFilters = () => {
    setName("");
    setStatus("");
    setBusinessName("");
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters = Boolean(name || status || businessName);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <ProductPageHeader
        title={t("reservations.title")}
        subtitle={t("reservations.restaurantSubtitle")}
        icon={CalendarCheck}
        count={t("reservations.count", { count: reservationsList.length })}
        action={{ to: "/browse-products", label: t("dashboard.browseOffers"), icon: ShoppingBasket }}
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
        <FilterField icon={Store}>
          <input
            type="text"
            placeholder={t("filters.searchByStore")}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
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
            <option value="Cancelled">{t("reservationStatus.Cancelled")}</option>
          </select>
        </FilterField>
      </FilterBar>

      {reservationsList.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={SearchX}
            title={t("reservations.noResultsTitle")}
            subtitle={t("reservations.noResultsSubtitle")}
          />
        ) : (
          <EmptyState
            icon={CalendarCheck}
            title={t("reservations.noCreatedResTitle")}
            subtitle={t("reservations.noCreatedResSubtitle")}
            action={{ to: "/browse-products", label: t("dashboard.browseOffers") }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {reservationsList.map((reservation) => (
            <DashboardReservationCard
              key={reservation.id}
              reservation={reservation}
              partyLabel={t("reservations.seller")}
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
      )}

      {cancellingReservation && (
        <Modal onClose={() => setCancellingReservation(null)}>
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <XCircle className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="text-lg font-bold text-gray-900">
              {t("reservations.cancelConfirmation")}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {t("reservations.cancelConfirmationText", {
                product: cancellingReservation.product_name,
                business: cancellingReservation.business_name,
              })}
            </p>
          </div>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setCancellingReservation(null)}
              className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              {t("reservations.keepButton")}
            </button>
            <button
              type="button"
              onClick={() => handleCancellation(cancellingReservation.id)}
              className="flex-1 cursor-pointer rounded-xl bg-red-600 py-2.5 font-semibold text-white transition-colors hover:bg-red-700"
            >
              {t("reservations.cancelButton")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default MyReservationsPage;
