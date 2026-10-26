import { useTranslation } from "react-i18next";
import { CalendarX, PackageCheck } from "lucide-react";
import ConfirmModal from "../common/ConfirmModal.js";
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
  const values = {
    product: reservation.product_name,
    business: reservation.business_name,
    quantity: reservation.quantity,
    unit: reservation.unit ? units[reservation.unit] || reservation.unit : "",
  };

  return (
    <ConfirmModal
      variant={isComplete ? "success" : "danger"}
      icon={isComplete ? PackageCheck : CalendarX}
      title={isComplete ? t("pickups.completeConfirmation") : t("pickups.cancelOverdueConfirmation")}
      message={
        isComplete
          ? t("pickups.completeConfirmationText", values)
          : t("pickups.cancelOverdueConfirmationText", values)
      }
      confirmLabel={isComplete ? t("pickups.confirmCompleteButton") : t("pickups.confirmCancelButton")}
      cancelLabel={t("pickups.keepButton")}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

export default PickupConfirmModal;
