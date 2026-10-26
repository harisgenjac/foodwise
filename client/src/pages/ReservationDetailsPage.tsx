import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Check,
  Clock,
  Hash,
  MapPin,
  PackageCheck,
  Phone,
  Scale,
  SearchX,
  Store,
  UtensilsCrossed,
  X,
  XCircle,
} from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import Breadcrumbs from "../components/Breadcrumbs.js";
import EmptyState from "../components/product/EmptyState.js";
import ConfirmModal from "../components/common/ConfirmModal.js";
import AcceptReservationModal from "../components/reservation/AcceptReservationModal.js";
import DetailItem from "../components/product/DetailItem.js";
import PickupConfirmModal from "../components/pickup/PickupConfirmModal.js";
import { usePickupActions } from "../hooks/usePickupActions.js";
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
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  // The open confirmation: accept (store), or decline, i.e. reject (store) / cancel (restaurant).
  const [confirming, setConfirming] = useState<"accept" | "decline" | null>(null);
  const [busy, setBusy] = useState(false);
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
    if (busy) return;
    setBusy(true);
    try {
      const response = await api.patch(`/reservations/${id}/${action}`);
      toast.success(response.data.message);
      setConfirming(null);
      fetchReservation();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      toast.error(message || t("reservations.actionError"));
    } finally {
      setBusy(false);
    }
  };

  // Picked up / missed pickup: only the store, only while Confirmed.
  const pickupActions = usePickupActions(fetchReservation);

  useEffect(() => {
    fetchReservation();
  }, [id]);

  const listPath = isStore ? "/reservations" : "/my-reservations";
  const section = { label: t(isStore ? "sidebar.reservations" : "sidebar.myReservations"), to: listPath };
  // The id is in the URL, so the trail is complete while the reservation loads.
  const breadcrumbs = [section, { label: t("breadcrumbs.reservation", { id }) }];

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto pb-10">
        <Breadcrumbs items={breadcrumbs} />
        <LoadingSpinner />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        <Breadcrumbs items={[section]} />
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
  const canHandOver = isStore && reservation.status === "Confirmed";
  // business_name here is the store's own; the pickup confirmation names the restaurant.
  const handOver = { ...reservation, business_name: reservation.restaurant_name || undefined };

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
      <Breadcrumbs items={breadcrumbs} />

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
            <div className="mb-2 flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${RESERVATION_STATUS_STYLES[reservation.status]}`}
              >
                {reservationStatuses[reservation.status] || reservation.status}
              </span>
              {reservation.is_overdue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                  <AlertTriangle className="h-3 w-3" />
                  {t("pickups.overdueToday")}
                </span>
              )}
            </div>
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
            {reservation.picked_up_at && (
              <DetailItem
                icon={PackageCheck}
                label={t("pickups.tabs.completed")}
                value={new Date(reservation.picked_up_at).toLocaleString(undefined, dateTimeFormat)}
              />
            )}
          </dl>

          {canHandOver && (
            <div className="mt-auto flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => pickupActions.request("complete", handOver)}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 font-semibold text-white shadow-sm shadow-green-600/20 transition-colors hover:bg-green-700"
              >
                <PackageCheck className="h-4 w-4" />
                {t("pickups.completeButton")}
              </button>
              {reservation.is_overdue && (
                <button
                  type="button"
                  onClick={() => pickupActions.request("cancel-overdue", handOver)}
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2.5 font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  <CalendarX className="h-4 w-4" />
                  {t("pickups.cancelOverdueButton")}
                </button>
              )}
            </div>
          )}

          {isPending && (
            <div className="mt-auto flex flex-col gap-2 sm:flex-row">
              {isStore ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirming("accept")}
                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 font-semibold text-white shadow-sm shadow-green-600/20 transition-colors hover:bg-green-700"
                  >
                    <Check className="h-4 w-4" />
                    {t("reservations.acceptButton")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming("decline")}
                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 font-semibold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                    {t("reservations.rejectButton")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming("decline")}
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

      {pickupActions.pending && (
        <PickupConfirmModal
          {...pickupActions.pending}
          busy={pickupActions.busy}
          onClose={pickupActions.close}
          onConfirm={pickupActions.confirm}
        />
      )}

      {confirming === "accept" && (
        <AcceptReservationModal
          reservation={reservation}
          restaurant={reservation.restaurant_name ?? ""}
          busy={busy}
          onConfirm={() => handleAction("accept")}
          onClose={() => setConfirming(null)}
        />
      )}

      {confirming === "decline" && (
        <ConfirmModal
          variant="danger"
          icon={XCircle}
          title={isStore ? t("reservations.rejectConfirmation") : t("reservations.cancelConfirmation")}
          message={
            isStore
              ? t("reservations.rejectConfirmationText", {
                  product: reservation.product_name,
                  business: reservation.restaurant_name,
                })
              : t("reservations.cancelConfirmationText", {
                  product: reservation.product_name,
                  business: reservation.business_name,
                })
          }
          confirmLabel={isStore ? t("reservations.rejectButton") : t("reservations.cancelButton")}
          cancelLabel={t("reservations.keepButton")}
          busy={busy}
          onConfirm={() => handleAction(isStore ? "reject" : "cancel")}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

export default ReservationDetailsPage;
