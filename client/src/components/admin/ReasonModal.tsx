import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import Modal from "../product/Modal.js";

interface ReasonModalProps {
  title: string;
  text: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

const MAX_REASON_LENGTH = 500;

// Confirmation for blocking an account or removing an offer; the server requires a reason
// and shows it to the user.
function ReasonModal({ title, text, confirmLabel, busy, onConfirm, onClose }: ReasonModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError(t("admin.common.reasonRequired"));
      return;
    }
    onConfirm(reason.trim());
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-600">{text}</p>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">{t("admin.common.reasonLabel")}</span>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
            }}
            maxLength={MAX_REASON_LENGTH}
            rows={3}
            placeholder={t("admin.common.reasonPlaceholder")}
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
          />
        </label>
        <p className={`mt-1 text-xs ${error ? "text-red-600" : "text-gray-500"}`}>
          {error || t("admin.common.reasonHint")}
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t("admin.common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="cursor-pointer rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default ReasonModal;
