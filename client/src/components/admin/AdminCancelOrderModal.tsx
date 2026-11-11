import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import api from "../../api/axios.js";
import ConfirmModal from "../common/ConfirmModal.js";
import { formatOrderCode } from "../../utils/orders.js";
import type { OrderStatus } from "../../types/index.js";

// Only orders that are still open can be cancelled by an admin.
export const ADMIN_CANCELLABLE: OrderStatus[] = ["Pending", "Confirmed"];

interface AdminCancelOrderModalProps {
  order: { id: number; code: string; status: OrderStatus };
  storeName: string;
  onClose: () => void;
  onCancelled: () => void;
}

// The admin cancels a whole order with a required reason; both sides are notified with it.
function AdminCancelOrderModal({ order, storeName, onClose, onCancelled }: AdminCancelOrderModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const cancel = async (reason: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/admin/orders/${order.id}/cancel`, { reason });
      toast.success(t("admin.orders.cancelled"));
      onCancelled();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("admin.common.actionError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmModal
      variant="danger"
      reason
      title={t("admin.orders.cancelTitle")}
      message={t(order.status === "Confirmed" ? "admin.orders.cancelTextConfirmed" : "admin.orders.cancelTextPending", {
        code: formatOrderCode(order.code),
        store: storeName,
      })}
      confirmLabel={t("admin.orders.cancel")}
      cancelLabel={t("admin.common.cancel")}
      busy={busy}
      onConfirm={cancel}
      onClose={onClose}
    />
  );
}

export default AdminCancelOrderModal;
