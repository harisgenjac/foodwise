import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Check,
  Clock,
  Hash,
  MapPin,
  Phone,
  Scale,
  SearchX,
  Store,
  UtensilsCrossed,
  X,
  XCircle,
} from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import EmptyState from "../components/product/EmptyState.jsx";
import Modal from "../components/product/Modal.jsx";
import DetailItem from "../components/product/DetailItem.jsx";
import { CATEGORY_IMAGES } from "../utils/categoryImages.js";
import { RESERVATION_STATUS_STYLES } from "../utils/reservationStatus.js";
import type { Reservation } from "../types/index.js";

const dateTimeFormat: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

function ReservationDetailsPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const { t } = useTranslation();
  const reservationStatuses = t("reservationStatus", {
    returnObjects: true,
  }) as Record<string, string>;
  const categories = t("categories", { returnObjects: true }) as Record<
    string,
    string
  >;
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const isStore = user?.role === "STORE";

  const fetchReservation = async () => {
    try {
      const response = await api.get("/reservations/" + id);
      const data: Reservation = response.data.reservation;
      setReservation(data);
    } catch (err) {
      console.error("Error fetching reservation:", err);
    } finally {
      setLoading(false);
    }
  };

  // accept/reject belong to the store, cancel to the restaurant; the server checks ownership.
  const handleAction = async (action: "accept" | "reject" | "cancel") => {
    try {
      const response = await api.patch(`/reservations/${id}/${action}`);
      toast.success(response.data.message);
      setConfirming(false);
      fetchReservation();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("reservations.actionError"));
    }
  };

  useEffect(() => {
    fetchReservation();
  }, [id]);

  if (loading) {
    return <LoadingSpinner />;
  }

  const listPath = isStore ? "/reservations" : "/my-reservations";

  if (!reservation) {
    return (
      <div className="max-w-5xl mx-auto pb-10">
        <EmptyState
          icon={SearchX}
          title={t("reservations.noReservationFoundTitle")}
          subtitle={t("reservations.noReservationFoundSubtitle")}
          action={{ to: listPath, label: t("reservations.backToList") }}
        />
      </div>
    );
  }

  const unit = reservation.unit ? units[reservation.unit] || reservation.unit : "";
  const originalPrice = Number(reservation.original_price ?? 0);
  const discountedPrice = Number(reservation.discounted_price ?? 0);
  const discountPercent =
    originalPrice > 0
      ? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)
      : 0;
  const total = (discountedPrice * Number(reservation.quantity)).toFixed(2);
  const image =
    (reservation.category && CATEGORY_IMAGES[reservation.category]) ||
    CATEGORY_IMAGES.Other;
  const isPending = reservation.status === "Pending";

  // The store sees who reserved; the restaurant sees where to pick up.
  const party = isStore
    ? {
        title: t("reservations.buyer"),
        icon: UtensilsCrossed,
        name: reservation.restaurant_name,
        city: reservation.restaurant_city,
        address: reservation.restaurant_address,
        phone: reservation.restaurant_phone,
        pickupHours: null,
      }
    : {
        title: t("reservations.seller"),
        icon: Store,
        name: reservation.business_name,
        city: reservation.city,
        address: reservation.store_address,
        phone: reservation.store_phone,
        pickupHours: reservation.store_pickup_hours,
      };
  const PartyIcon = party.icon;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-orange-50 hover:text-orange-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("reservations.backButton")}
      </button>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:flex">
        <div className="relative h-56 shrink-0 md:h-auto md:w-2/5">
          <img
            src={image}
            alt={reservation.product_name}
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/25 via-transparent to-transparent" />
          {reservation.category && (
            <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold">
              {categories[reservation.category] || reservation.category}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-5 p-6 md:p-8">
          <div>
            <span
              className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${RESERVATION_STATUS_STYLES[reservation.status]}`}
            >
              {reservationStatuses[reservation.status] || reservation.status}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              {reservation.product_name}
            </h1>
            {reservation.description && (
              <p className="mt-2 text-gray-600">{reservation.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-green-600">
                {reservation.discounted_price} KM
              </span>
              <span className="text-lg text-gray-400 line-through">
                {reservation.original_price} KM
              </span>
              {discountPercent > 0 && (
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                  {t("product.discountBadge", { percent: discountPercent })}
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{t("reservations.total")}</p>
              <p className="text-xl font-bold text-gray-900">{total} KM</p>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <DetailItem
              icon={Scale}
              label={t("reservations.quantityReserved")}
              value={`${reservation.quantity} ${unit}`}
            />
            <DetailItem
              icon={CalendarClock}
              label={t("dashboard.pickupDate")}
              value={new Date(reservation.pickup_date).toLocaleString(undefined, dateTimeFormat)}
            />
            <DetailItem
              icon={CalendarPlus}
              label={t("reservations.createdAt")}
              value={new Date(reservation.created_at).toLocaleString(undefined, dateTimeFormat)}
            />
            <DetailItem
              icon={Hash}
              label={t("reservations.reservationId")}
              value={`#${reservation.id}`}
            />
          </dl>

          {isPending && (
            <div className="mt-auto flex flex-col gap-2 sm:flex-row">
              {isStore ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleAction("accept")}
                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 font-semibold text-white shadow-sm shadow-green-600/20 transition-colors hover:bg-green-700"
                  >
                    <Check className="h-4 w-4" />
                    {t("reservations.acceptButton")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 font-semibold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                    {t("reservations.rejectButton")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 font-semibold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                  {t("reservations.cancelButton")}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <PartyIcon className="h-4 w-4" strokeWidth={2} />
          </span>
          {party.title}
        </h2>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-lg font-bold text-gray-900">
              {party.name || "-"}
            </p>
            {(party.address || party.city) && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                {[party.address, party.city].filter(Boolean).join(", ")}
              </p>
            )}
            {party.phone && (
              <a
                href={`tel:${party.phone}`}
                className="flex w-fit items-center gap-2 text-sm font-medium text-orange-700 hover:underline"
              >
                <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                {party.phone}
              </a>
            )}
            {party.pickupHours && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                {t("reservations.pickupHours")}: {party.pickupHours}
              </p>
            )}
          </div>

          {!isStore && reservation.store_id && (
            <Link
              to={`/stores/${reservation.store_id}`}
              className="group inline-flex w-fit shrink-0 items-center gap-1.5 rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
            >
              {t("reservations.viewStore")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </section>

      {confirming && (
        <Modal onClose={() => setConfirming(false)}>
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <XCircle className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="text-lg font-bold text-gray-900">
              {isStore
                ? t("reservations.rejectConfirmation")
                : t("reservations.cancelConfirmation")}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {isStore
                ? t("reservations.rejectConfirmationText", {
                    product: reservation.product_name,
                    business: reservation.restaurant_name,
                  })
                : t("reservations.cancelConfirmationText", {
                    product: reservation.product_name,
                    business: reservation.business_name,
                  })}
            </p>
          </div>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              {t("reservations.keepButton")}
            </button>
            <button
              type="button"
              onClick={() => handleAction(isStore ? "reject" : "cancel")}
              className="flex-1 cursor-pointer rounded-xl bg-red-600 py-2.5 font-semibold text-white transition-colors hover:bg-red-700"
            >
              {isStore
                ? t("reservations.rejectButton")
                : t("reservations.cancelButton")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default ReservationDetailsPage;
