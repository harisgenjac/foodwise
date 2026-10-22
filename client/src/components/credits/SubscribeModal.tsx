import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import AutoRenewTooltip from "./AutoRenewTooltip.js";
import { formatCreditMonth } from "../../utils/credits.js";
import type { Plan, Role } from "../../types/index.js";

interface SubscribeModalProps {
  plan: Plan;
  role: Role;
  // "current" while the user has no subscription this month, else "next" (a plan change).
  period: "current" | "next";
  month: string;
  // True when the current month has already started (any day but the 1st).
  monthStarted: boolean;
  onClose: () => void;
  onSent: () => void;
}

// Explains credits in plain words before the user sends a subscription request, and lets them
// choose this month only or auto-renew.
function SubscribeModal({ plan, role, period, month, monthStarted, onClose, onSent }: SubscribeModalProps) {
  const { t } = useTranslation();
  const [autoRenew, setAutoRenew] = useState(false);
  const [sending, setSending] = useState(false);
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];
  const isStore = role === "STORE";

  const send = async () => {
    if (sending) return;
    setSending(true);
    try {
      await api.post("/credits/requests", {
        request_type: "SUBSCRIPTION",
        plan_id: plan.id,
        period,
        auto_renew: autoRenew,
      });
      toast.success(t("credits.modal.sent"));
      onSent();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("credits.profile.requestError"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-900">{t("credits.modal.title", { plan: plan.name })}</h3>
      <p className="mt-1 text-sm text-gray-500">
        {t("credits.profile.planCredits", { count: plan.credits_per_period })} · {plan.price} KM
      </p>

      <div className="mt-4 max-h-64 space-y-3 overflow-y-auto rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
        <div>
          <p className="font-semibold text-gray-900">{t("credits.modal.whatTitle")}</p>
          <p>{t(isStore ? "credits.modal.chargeStore" : "credits.modal.chargeRestaurant")}</p>
        </div>
        <div>
          <p className="font-semibold text-gray-900">{t("credits.modal.refundTitle")}</p>
          <p>{t(isStore ? "credits.modal.refundStore" : "credits.modal.refundRestaurant")}</p>
        </div>
        <p>{t("credits.modal.expiry")}</p>
        <p>{t("credits.modal.balance")}</p>
      </div>

      <p className="mt-4 text-sm text-gray-700">
        {t(period === "current" ? "credits.modal.forCurrent" : "credits.modal.forNext", {
          month: formatCreditMonth(month, monthNames),
        })}
      </p>
      {period === "current" && monthStarted && (
        <p className="mt-1 text-xs text-amber-700">{t("credits.modal.smallerPlanHint")}</p>
      )}

      <fieldset className="mt-3 space-y-2">
        <legend className="sr-only">{t("credits.profile.autoRenew")}</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
          <input type="radio" name="renewal" checked={!autoRenew} onChange={() => setAutoRenew(false)} />
          {t("credits.modal.thisMonthOnly")}
        </label>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
            <input type="radio" name="renewal" checked={autoRenew} onChange={() => setAutoRenew(true)} />
            {t("credits.modal.autoRenew")}
          </label>
          <AutoRenewTooltip />
        </div>
      </fieldset>

      <p className="mt-4 text-xs text-gray-500">{t("credits.modal.payment")}</p>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          {t("credits.modal.cancel")}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="flex-1 cursor-pointer rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"
        >
          {t("credits.modal.submit")}
        </button>
      </div>
    </Modal>
  );
}

export default SubscribeModal;
