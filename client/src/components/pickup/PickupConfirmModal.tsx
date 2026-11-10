import { useTranslation } from "react-i18next";
import { CalendarX, PackageCheck } from "lucide-react";
import ConfirmModal from "../common/ConfirmModal.js";
import { formatMoney, formatOrderCode } from "../../utils/orders.js";
import type { PendingPickupAction } from "../../hooks/usePickupActions.js";

interface PickupConfirmModalProps extends PendingPickupAction {
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Confirms a handover or a missed pickup of a whole order (there is no partial pickup).
function PickupConfirmModal({ action, order, busy, onClose, onConfirm }: PickupConfirmModalProps) {
  const { t } = useTranslation();
  const isComplete = action === "complete";
  const values = {
    code: formatOrderCode(order.code),
    business: order.business_name,
    items: t("orders.itemCount", { count: order.item_count }),
    total: formatMoney(order.total),
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
