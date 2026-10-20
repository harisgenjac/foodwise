import { useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import api from "../api/axios.js";
import type { Reservation } from "../types/index.js";

// "complete": the store hands the food over; "cancel-overdue": the restaurant missed its pickup time.
export type PickupAction = "complete" | "cancel-overdue";

export interface PendingPickupAction {
  action: PickupAction;
  reservation: Reservation;
}

// Shared by the pickups page, the store's reservation list and the reservation details:
// opens the confirmation for an action, sends it once (double clicks are ignored) and reports the result.
export function usePickupActions(onDone: () => void) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingPickupAction | null>(null);
  const [busy, setBusy] = useState(false);

  const request = (action: PickupAction, reservation: Reservation) => setPending({ action, reservation });
  const close = () => setPending(null);

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const response = await api.patch(`/reservations/${pending.reservation.id}/${pending.action}`);
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

  return { pending, busy, request, close, confirm };
}
