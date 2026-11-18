import { useId, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Timer, Truck } from "lucide-react";
import api, { apiErrorMessage } from "../../api/axios.js";
import FormSection from "../form/FormSection.js";
import { inputStyle } from "../form/FormField.js";
import OrderPauseControl from "./OrderPauseControl.js";
import { PREPARATION_MINUTES } from "../../utils/orderPause.js";
import type { OrderSettings } from "../../types/index.js";

// A store's order settings on My profile: delivery on or off, the default preparation time and
// the pause on new orders. Each saves at once, like the email switch.
function OrderSettingsSection({ initial }: { initial: OrderSettings }) {
  const { t } = useTranslation();
  const deliveryLabelId = useId();
  const deliveryHintId = useId();
  const preparationId = useId();
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async (change: Partial<Pick<OrderSettings, "delivery_enabled" | "preparation_minutes">>) => {
    if (saving) return;
    const previous = settings;
    setSaving(true);
    setSettings({ ...settings, ...change });
    try {
      const response = await api.patch("/users/me/order-settings", change);
      setSettings(response.data.settings);
      toast.success(response.data.message);
    } catch (err) {
      setSettings(previous);
      const message = apiErrorMessage(err);
      toast.error(message || t("orderSettings.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSection title={t("orderSettings.title")} icon={Truck} description={t("orderSettings.description")}>
      <div className="divide-y divide-gray-100">
        <div className="pb-4">
          <OrderPauseControl pause={settings} onChange={setSettings} />
        </div>

        <div className="py-4">
          {/* The whole row is the touch target (at least 44 px high). */}
          <button
            type="button"
            role="switch"
            aria-checked={settings.delivery_enabled}
            aria-labelledby={deliveryLabelId}
            aria-describedby={deliveryHintId}
            onClick={() => save({ delivery_enabled: !settings.delivery_enabled })}
            disabled={saving}
            className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 rounded-xl text-left disabled:cursor-wait"
          >
            <span className="min-w-0">
              <span id={deliveryLabelId} className="block font-medium text-gray-900">
                {t("orderSettings.delivery")}
              </span>
              <span id={deliveryHintId} className="mt-0.5 block text-sm text-gray-500">
                {t(settings.delivery_enabled ? "orderSettings.deliveryOnHint" : "orderSettings.deliveryOffHint")}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                settings.delivery_enabled ? "bg-orange-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  settings.delivery_enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <label htmlFor={preparationId} className="min-w-0">
            <span className="flex items-center gap-1.5 font-medium text-gray-900">
              <Timer className="h-4 w-4 text-gray-400" aria-hidden="true" />
              {t("orderSettings.preparation")}
            </span>
            <span className="mt-0.5 block text-sm text-gray-500">{t("orderSettings.preparationHint")}</span>
          </label>
          <select
            id={preparationId}
            value={settings.preparation_minutes}
            onChange={(e) => save({ preparation_minutes: Number(e.target.value) })}
            disabled={saving}
            className={`${inputStyle.replace("pl-10", "pl-3")} sm:w-40`}
          >
            {PREPARATION_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {t("orderSettings.minutes", { count: minutes })}
              </option>
            ))}
          </select>
        </div>
      </div>
    </FormSection>
  );
}

export default OrderSettingsSection;
