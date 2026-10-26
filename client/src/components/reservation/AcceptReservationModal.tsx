import { useTranslation } from "react-i18next";
import { CalendarCheck } from "lucide-react";
import ConfirmModal from "../common/ConfirmModal.js";
import { formatDateTime } from "../../utils/admin.js";
import type { Reservation } from "../../types/index.js";

interface AcceptReservationModalProps {
  reservation: Reservation;
  // The restaurant's name; the field holding it differs between the list and the details page.
  restaurant: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// The store accepts a pending reservation: the restaurant is notified and it cannot be undone,
// so the dialog repeats what is being promised (product, quantity, restaurant, pickup time).
function AcceptReservationModal({ reservation, restaurant, busy, onConfirm, onClose }: AcceptReservationModalProps) {
  const { t } = useTranslation();
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const unit = reservation.unit ? units[reservation.unit] || reservation.unit : "";
  const rows = [
    { label: t("reservations.acceptSummary.product"), value: reservation.product_name },
    { label: t("reservations.acceptSummary.quantity"), value: `${reservation.quantity} ${unit}`.trim() },
    { label: t("reservations.acceptSummary.restaurant"), value: restaurant },
    { label: t("reservations.acceptSummary.pickup"), value: formatDateTime(reservation.pickup_date) },
  ];

  return (
    <ConfirmModal
      variant="success"
      icon={CalendarCheck}
      title={t("reservations.acceptConfirmation")}
      message={t("reservations.acceptConfirmationText", { business: restaurant })}
      confirmLabel={t("reservations.acceptButton")}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <dl className="mt-4 space-y-1.5 rounded-xl bg-gray-50 p-4 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-3">
            <dt className="text-gray-500">{row.label}</dt>
            <dd className="text-right font-medium text-gray-900">{row.value || "-"}</dd>
          </div>
        ))}
      </dl>
    </ConfirmModal>
  );
}

export default AcceptReservationModal;
