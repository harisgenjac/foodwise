import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import type { Role, TopupPackage } from "../../types/index.js";

interface TopupModalProps {
  topup: TopupPackage;
  role: Role;
  // Last day of the current month, when the extra credits expire.
  periodEnd: string;
  onClose: () => void;
  onSent: () => void;
}

// Explains what extra credits are before the user sends a top-up request.
function TopupModal({ topup, role, periodEnd, onClose, onSent }: TopupModalProps) {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (sending) return;
    setSending(true);
    try {
      await api.post("/credits/requests", { request_type: "TOPUP", topup_package_id: topup.id });
      toast.success(t("credits.profile.topupSent"));
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
      <h3 className="text-lg font-bold text-gray-900">
        {t("credits.topupModal.title", { credits: t("credits.profile.creditsCount", { count: topup.credits }) })}
      </h3>
      <p className="mt-1 text-sm text-gray-500">{t("credits.profile.price", { price: topup.price })}</p>

      <div className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
        <div>
          <p className="font-semibold text-gray-900">{t("credits.topupModal.whatTitle")}</p>
          <p>{t("credits.topupModal.what")}</p>
        </div>
        <p>{t(role === "STORE" ? "credits.modal.chargeStore" : "credits.modal.chargeRestaurant")}</p>
        <p>{t("credits.topupModal.expiry", { date: formatDisplayDate(periodEnd) })}</p>
      </div>

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

export default TopupModal;
