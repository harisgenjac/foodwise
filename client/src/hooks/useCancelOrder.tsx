import { useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { XCircle } from "lucide-react";
import api from "../api/axios.js";
import ConfirmModal from "../components/common/ConfirmModal.js";
import { formatOrderCode } from "../utils/orders.js";

// The order the restaurant wants to withdraw, and the store it was sent to.
interface CancellableOrder {
  id: number;
  code: string;
  storeName: string;
}

// The restaurant withdraws a Pending order (My orders and the order details): `request` opens the
// confirmation, `modal` renders it, the request is sent once and `onDone` runs after it succeeds.
export function useCancelOrder(onDone: () => void) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<CancellableOrder | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const response = await api.post(`/orders/${pending.id}/cancel`);
      toast.success(response.data.message);
      setPending(null);
      onDone();
    } catch (err) {
      console.error(err);
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("reservations.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const modal = pending && (
    <ConfirmModal
      variant="danger"
      icon={XCircle}
      title={t("orders.cancelConfirmation")}
      message={t("orders.cancelConfirmationText", { code: formatOrderCode(pending.code), business: pending.storeName })}
      confirmLabel={t("orders.cancelButton")}
      cancelLabel={t("reservations.keepButton")}
      busy={busy}
      onConfirm={confirm}
      onClose={() => setPending(null)}
    />
  );

  return { request: setPending, modal };
}
