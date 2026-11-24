import { useId, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import api, { apiErrorMessage } from "../../api/axios.js";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../product/Modal.js";
import { inputStyle } from "../form/FormField.js";
import { formatDateTime } from "../../utils/admin.js";
import { formatOrderCode } from "../../utils/orders.js";
import { PROBLEM_STATUSES, PROBLEM_TEXT_MAX } from "../../utils/problems.js";
import type { AdminOrderProblem, ProblemStatus } from "../../types/index.js";

interface ProblemReplyModalProps {
  problem: AdminOrderProblem;
  onClose: () => void;
  // Called after the report was saved, to reload the list.
  onDone: () => void;
}

// The admin handles one problem report: its status and a reply to the restaurant
// (PATCH /admin/problems/:id). The restaurant is notified of a new reply and of a resolution.
function ProblemReplyModal({ problem, onClose, onDone }: ProblemReplyModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [status, setStatus] = useState<ProblemStatus>(problem.status);
  const [reply, setReply] = useState(problem.admin_reply ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const body: { status: ProblemStatus; reply?: string } = { status };
      if (reply.trim() !== "" && reply.trim() !== problem.admin_reply) body.reply = reply.trim();
      await api.patch(`/admin/problems/${problem.id}`, body);
      toast.success(t("admin.problems.saved"));
      onClose();
      onDone();
    } catch (err) {
      const message = apiErrorMessage(err);
      toast.error(message || t("admin.common.actionError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <ModalHeader>
        <h3 id={titleId} className="text-lg font-bold text-neutral-900">
          {t("admin.problems.modalTitle", { code: formatOrderCode(problem.order_code) })}
        </h3>
      </ModalHeader>
      <ModalBody className="space-y-4 pt-2">
        <div className="rounded-xl bg-neutral-50 p-3 text-sm">
          <p className="font-semibold text-neutral-900">{t(`orders.problems.reasons.${problem.reason}`)}</p>
          <p className="mt-1 whitespace-pre-line text-neutral-700">{problem.text ?? t("admin.problems.noText")}</p>
          <p className="mt-2 text-xs text-neutral-500">
            {t("admin.problems.reportedBy", {
              restaurant: problem.restaurant_name ?? problem.restaurant_email,
              time: formatDateTime(problem.created_at),
            })}
          </p>
        </div>
        <label className="block text-sm font-medium text-neutral-700">
          {t("admin.problems.status")}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ProblemStatus)}
            className={`${inputStyle} mt-1.5`}
          >
            {PROBLEM_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`orders.problems.statuses.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            {t("admin.problems.reply")}
            <textarea
              rows={4}
              maxLength={PROBLEM_TEXT_MAX}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              className={`${inputStyle} mt-1.5 resize-none`}
            />
          </label>
          <p className="mt-1 text-xs text-neutral-500">{t("admin.problems.replyHint")}</p>
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 cursor-pointer rounded-xl bg-neutral-100 py-2.5 font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
        >
          {t("admin.common.cancel")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="flex-1 cursor-pointer rounded-xl bg-brand-800 py-2.5 font-semibold text-white transition-colors hover:bg-brand-900 disabled:cursor-wait disabled:opacity-60"
        >
          {t("admin.problems.save")}
        </button>
      </ModalFooter>
    </Modal>
  );
}

export default ProblemReplyModal;
