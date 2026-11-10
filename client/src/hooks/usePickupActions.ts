import { useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import api from "../api/axios.js";
import type { Order } from "../types/index.js";

// "complete": the store hands the food over; "cancel-overdue": the restaurant missed its pickup day.
export type PickupAction = "complete" | "cancel-overdue";

// The order the confirmation is about; `business_name` is the restaurant (the other party).
export type PickupOrder = Pick<Order, "id" | "code" | "item_count" | "total" | "business_name">;

export interface PendingPickupAction {
  action: PickupAction;
  order: PickupOrder;
}

// Shared by the pickups page, the store's order list and the order details: opens the
// confirmation for an action on a whole order, sends it once (double clicks are ignored) and
// reports the result.
export function usePickupActions(onDone: () => void) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingPickupAction | null>(null);
  const [busy, setBusy] = useState(false);

  const request = (action: PickupAction, order: PickupOrder) => setPending({ action, order });
  const close = () => setPending(null);

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const response = await api.post(`/orders/${pending.order.id}/${pending.action}`);
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
