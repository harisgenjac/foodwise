import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import { inputStyle } from "../form/FormField.js";
import { creditRequestSender, creditRequestUser, describeCreditRequest, formatCreditMonth } from "../../utils/credits.js";
import type { AdminCreditRequest } from "../../types/index.js";

const MAX_NOTE_LENGTH = 500;

export type CreditRequestAction = "approve" | "reject";

// The approve and reject buttons of a pending request; each opens the decision modal.
export function CreditRequestDecisionButtons({ onDecide }: { onDecide: (action: CreditRequestAction) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-1">
      <button
        type="button"
        onClick={() => onDecide("approve")}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
      >
        <Check className="h-4 w-4" />
        {t("admin.creditRequests.approve")}
      </button>
      <button
        type="button"
        onClick={() => onDecide("reject")}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
      >
        <X className="h-4 w-4" />
        {t("admin.creditRequests.reject")}
      </button>
    </div>
  );
}

interface CreditRequestDecisionModalProps {
  request: AdminCreditRequest;
  action: CreditRequestAction;
  onClose: () => void;
  // Called after the decision was saved, to reload whatever shows the request.
  onDone: () => void;
}

// Approves or rejects a pending credit request, with an internal note the user never sees.
function CreditRequestDecisionModal({ request, action, onClose, onDone }: CreditRequestDecisionModalProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const requestTypes = t("credits.requestTypes", { returnObjects: true }) as Record<string, string>;
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];
  const approve = action === "approve";

  const decide = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/admin/credits/requests/${request.id}/${action}`, { note });
      toast.success(t(approve ? "admin.creditRequests.approved" : "admin.creditRequests.rejected"));
      onClose();
      onDone();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("admin.common.actionError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-900">
        {t(approve ? "admin.creditRequests.approveTitle" : "admin.creditRequests.rejectTitle")}
      </h3>
      <p className="mt-2 text-sm text-gray-600">
        {t(approve ? "admin.creditRequests.approveText" : "admin.creditRequests.rejectText", {
          user: creditRequestUser(request),
          what: `${requestTypes[request.request_type]} (${describeCreditRequest(request, t)})`,
          month: formatCreditMonth(request.period_month, monthNames),
        })}
      </p>
      {creditRequestSender(request, t) && (
        <p className="mt-1 text-xs font-medium text-teal-700">{creditRequestSender(request, t)}</p>
      )}
      <label className="mt-4 block text-sm font-medium text-gray-700">
        {t("admin.creditRequests.note")}
        <textarea
          rows={3}
          maxLength={MAX_NOTE_LENGTH}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={`${inputStyle} mt-1.5 resize-none`}
        />
      </label>
      <p className="mt-1 text-xs text-gray-500">{t("admin.creditRequests.noteHint")}</p>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          {t("admin.common.cancel")}
        </button>
        <button
          type="button"
          onClick={decide}
          disabled={busy}
          className={`flex-1 cursor-pointer rounded-xl py-2.5 font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-60 ${
            approve ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {t(approve ? "admin.creditRequests.approve" : "admin.creditRequests.reject")}
        </button>
      </div>
    </Modal>
  );
}

export default CreditRequestDecisionModal;
