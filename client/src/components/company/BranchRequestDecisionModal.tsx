import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import { inputStyle } from "../form/FormField.js";
import { describeCreditRequest } from "../../utils/credits.js";
import type { CreditRequest } from "../../types/index.js";

const MAX_NOTE_LENGTH = 500;

interface BranchRequestDecisionModalProps {
  request: CreditRequest;
  action: "approve" | "reject";
  onClose: () => void;
  onDone: () => void;
}

// The headquarters decides on a branch's top-up request: approving sends it to the administrator
// (who approves it once it is paid); rejecting takes an optional note the branch sees.
function BranchRequestDecisionModal({ request, action, onClose, onDone }: BranchRequestDecisionModalProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const approve = action === "approve";

  const decide = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/company/credits/branch-requests/${request.id}/${action}`, approve ? {} : { note });
      toast.success(t(approve ? "company.credits.approved" : "company.credits.rejected"));
      onClose();
      onDone();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("company.credits.actionError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="branch-request-decision">
      <h3 id="branch-request-decision" className="text-lg font-bold text-gray-900">
        {t(approve ? "company.credits.approveTitle" : "company.credits.rejectTitle")}
      </h3>
      <p className="mt-2 text-sm text-gray-600">
        {t(approve ? "company.credits.approveText" : "company.credits.rejectText", {
          branch: request.branch_name ?? "",
          what: `${describeCreditRequest(request, t)} · ${t("credits.profile.price", { price: request.price })}`,
        })}
      </p>
      {!approve && (
        <>
          <label className="mt-4 block text-sm font-medium text-gray-700">
            {t("company.credits.note")}
            <textarea
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${inputStyle} mt-1.5 resize-none`}
            />
          </label>
          <p className="mt-1 text-xs text-gray-500">{t("company.credits.noteHint")}</p>
        </>
      )}
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
          onClick={decide}
          disabled={busy}
          className={`flex-1 cursor-pointer rounded-xl py-2.5 font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-60 ${
            approve ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {t(approve ? "company.credits.approve" : "company.credits.reject")}
        </button>
      </div>
    </Modal>
  );
}

export default BranchRequestDecisionModal;
