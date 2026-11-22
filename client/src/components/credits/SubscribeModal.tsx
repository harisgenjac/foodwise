import { useId, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import api, { apiErrorMessage } from "../../api/axios.js";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../product/Modal.js";
import AutoRenewTooltip from "./AutoRenewTooltip.js";
import { formatCreditMonth } from "../../utils/credits.js";
import type { Plan } from "../../types/index.js";

interface SubscribeModalProps {
  plan: Plan;
  // "current" while the user has no subscription this month, else "next" (a plan change).
  period: "current" | "next";
  month: string;
  // True when the current month has already started (any day but the 1st).
  monthStarted: boolean;
  onClose: () => void;
  onSent?: () => void;
  // Only confirms the choice (this month only or auto-renew) without sending: My profile sends the
  // request itself when the page is saved.
  onConfirm?: (autoRenew: boolean) => void;
  // A headquarters choosing for its branch: where the request goes and the branch's name for the title.
  endpoint?: string;
  branchName?: string;
}

// Explains credits in plain words before the user (or a headquarters for its branch) sends a
// subscription request, and lets them choose this month only or auto-renew. With `onConfirm` it
// sends nothing and hands the choice back (My profile sends it with the rest of the page).
function SubscribeModal({
  plan,
  period,
  month,
  monthStarted,
  onClose,
  onSent,
  onConfirm,
  endpoint = "/credits/requests",
  branchName,
}: SubscribeModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [autoRenew, setAutoRenew] = useState(false);
  const [sending, setSending] = useState(false);
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];

  const send = async () => {
    if (onConfirm) {
      onConfirm(autoRenew);
      return;
    }
    if (sending) return;
    setSending(true);
    try {
      await api.post(endpoint, {
        request_type: "SUBSCRIPTION",
        plan_id: plan.id,
        period,
        auto_renew: autoRenew,
      });
      toast.success(t("credits.modal.sent"));
      onSent?.();
    } catch (err) {
      const message = apiErrorMessage(err);
      toast.error(message || t("credits.profile.requestError"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <ModalHeader>
        <h3 id={titleId} className="text-lg font-bold text-neutral-900">
          {branchName
            ? t("credits.modal.titleForBranch", { plan: plan.name, branch: branchName })
            : t("credits.modal.title", { plan: plan.name })}
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          {t("credits.profile.planCredits", { count: plan.credits_per_period })} · {plan.price} KM
        </p>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-3 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
          <div>
            <p className="font-semibold text-neutral-900">{t("credits.modal.whatTitle")}</p>
            <p>{t("credits.modal.chargeStore")}</p>
          </div>
          <div>
            <p className="font-semibold text-neutral-900">{t("credits.modal.refundTitle")}</p>
            <p>{t("credits.modal.refundStore")}</p>
          </div>
          <p>{t("credits.modal.expiry")}</p>
          <p>{t("credits.modal.balance")}</p>
        </div>

        <p className="mt-4 text-sm text-neutral-700">
          {t(period === "current" ? "credits.modal.forCurrent" : "credits.modal.forNext", {
            month: formatCreditMonth(month, monthNames),
          })}
        </p>
        {period === "current" && monthStarted && (
          <p className="mt-1 text-xs text-warning-700">{t("credits.modal.smallerPlanHint")}</p>
        )}

        <fieldset className="mt-3 space-y-2">
          <legend className="sr-only">{t("credits.profile.autoRenew")}</legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
            <input type="radio" name="renewal" checked={!autoRenew} onChange={() => setAutoRenew(false)} />
            {t("credits.modal.thisMonthOnly")}
          </label>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
              <input type="radio" name="renewal" checked={autoRenew} onChange={() => setAutoRenew(true)} />
              {t("credits.modal.autoRenew")}
            </label>
            <AutoRenewTooltip />
          </div>
        </fieldset>

        <p className="mt-4 text-xs text-neutral-500">{t("credits.modal.payment")}</p>
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 cursor-pointer rounded-xl bg-neutral-100 py-2.5 font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
        >
          {t("credits.modal.cancel")}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="flex-1 cursor-pointer rounded-xl bg-brand-800 py-2.5 font-semibold text-white transition-colors hover:bg-brand-900 disabled:cursor-wait disabled:opacity-60"
        >
          {t("credits.modal.submit")}
        </button>
      </ModalFooter>
    </Modal>
  );
}

export default SubscribeModal;
