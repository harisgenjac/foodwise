import { useTranslation } from "react-i18next";
import { CalendarX, PackageCheck } from "lucide-react";
import Modal from "../product/Modal.js";
import type { PendingPickupAction } from "../../hooks/usePickupActions.js";

interface PickupConfirmModalProps extends PendingPickupAction {
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function PickupConfirmModal({ action, reservation, busy, onClose, onConfirm }: PickupConfirmModalProps) {
  const { t } = useTranslation();
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const isComplete = action === "complete";
  const Icon = isComplete ? PackageCheck : CalendarX;
  const values = {
    product: reservation.product_name,
    business: reservation.business_name,
    quantity: reservation.quantity,
    unit: reservation.unit ? units[reservation.unit] || reservation.unit : "",
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <span
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
            isComplete ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
          }`}
        >
          <Icon className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <h3 className="text-lg font-bold text-gray-900">
          {isComplete ? t("pickups.completeConfirmation") : t("pickups.cancelOverdueConfirmation")}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {isComplete
            ? t("pickups.completeConfirmationText", values)
            : t("pickups.cancelOverdueConfirmationText", values)}
        </p>
      </div>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          {t("pickups.keepButton")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`flex-1 cursor-pointer rounded-xl py-2.5 font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-60 ${
            isComplete ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {isComplete ? t("pickups.confirmCompleteButton") : t("pickups.confirmCancelButton")}
        </button>
      </div>
    </Modal>
  );
}

export default PickupConfirmModal;
