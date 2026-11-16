import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { PauseCircle, PlayCircle } from "lucide-react";
import api from "../../api/axios.js";
import type { OrderSettings, StorePause } from "../../types/index.js";
import { formatPauseEnd, isPaused, pauseUntil, type PauseOption } from "../../utils/orderPause.js";
import PauseOrdersModal from "./PauseOrdersModal.js";

interface OrderPauseControlProps {
  pause: StorePause;
  // The saved settings, after pausing or resuming.
  onChange: (settings: OrderSettings) => void;
  // "card": a highlighted box for the dashboard; "row": a row inside the profile section.
  variant?: "card" | "row";
}

// A store pauses new orders (asking how long) or resumes them; it saves at once. On the store's
// dashboard and on My profile.
function OrderPauseControl({ pause, onChange, variant = "row" }: OrderPauseControlProps) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const paused = isPaused(pause);

  const save = async (body: { orders_paused: boolean; orders_paused_until?: string | null }) => {
    setSaving(true);
    try {
      const response = await api.patch("/users/me/order-settings", body);
      onChange(response.data.settings);
      toast.success(response.data.message);
      setAsking(false);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("orderSettings.error"));
    } finally {
      setSaving(false);
    }
  };

  const pauseFor = (option: PauseOption) => save({ orders_paused: true, orders_paused_until: pauseUntil(option) });

  const box =
    variant === "card"
      ? `rounded-2xl border p-4 shadow-sm ${paused ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-white"}`
      : "";

  return (
    <div
      data-testid="order-pause"
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${box}`}
    >
      <div className="flex min-w-0 gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            paused ? "bg-amber-100 text-amber-700" : "bg-green-50 text-green-600"
          }`}
          aria-hidden="true"
        >
          {paused ? <PauseCircle className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-gray-900">
            {paused ? t("orderPause.pausedTitle") : t("orderPause.receivingTitle")}
          </p>
          <p className="mt-0.5 text-sm text-gray-500">
            {paused
              ? t("orderPause.pausedText", { until: formatPauseEnd(pause.orders_paused_until, t) })
              : t("orderPause.receivingText")}
          </p>
        </div>
      </div>
      {paused ? (
        <button
          type="button"
          onClick={() => save({ orders_paused: false })}
          disabled={saving}
          className="min-h-11 shrink-0 cursor-pointer rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"
        >
          {t("orderPause.resume")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="min-h-11 shrink-0 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {t("orderPause.pause")}
        </button>
      )}
      {asking && <PauseOrdersModal busy={saving} onConfirm={pauseFor} onClose={() => setAsking(false)} />}
    </div>
  );
}

export default OrderPauseControl;
