import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange } from "lucide-react";
import FormSection from "../form/FormSection.js";
import DateInput from "../form/DateInput.js";
import { PRESETS, presetPeriod, type Preset } from "../../utils/reportPeriods.js";

export interface ReportPeriod {
  from: string;
  to: string;
}

// The chosen period of a reports page: a preset (this month by default) or custom dates.
export const useReportPeriod = () => {
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [period, setPeriod] = useState<ReportPeriod>(() => presetPeriod("thisMonth"));

  const choosePreset = (next: Preset) => {
    setPreset(next);
    if (next !== "custom") setPeriod(presetPeriod(next));
  };

  const changeDate = (field: keyof ReportPeriod, value: string) => {
    setPreset("custom");
    setPeriod((current) => ({ ...current, [field]: value }));
  };

  // Only an empty or reversed period is caught here; the server also limits it to one year.
  const valid = Boolean(period.from && period.to && period.from <= period.to);

  return { preset, period, choosePreset, changeDate, valid };
};

interface ReportPeriodPickerProps {
  state: ReturnType<typeof useReportPeriod>;
  // More fields under the dates, e.g. the headquarters' branch filter.
  children?: ReactNode;
}

// The period card of the reports pages: preset pills and the from / to dates.
function ReportPeriodPicker({ state, children }: ReportPeriodPickerProps) {
  const { t } = useTranslation();
  const { preset, period, choosePreset, changeDate } = state;

  return (
    <FormSection title={t("reports.periodTitle")} icon={CalendarRange} description={t("reports.periodDescription")}>
      <div className="mb-5 flex flex-wrap gap-2">
        {[...PRESETS, "custom" as const].map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={preset === key}
            onClick={() => choosePreset(key)}
            className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              preset === key
                ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t(`reports.presets.${key}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateInput
          label={t("reports.from")}
          value={period.from}
          max={period.to || undefined}
          onChange={(value) => changeDate("from", value)}
        />
        <DateInput
          label={t("reports.to")}
          value={period.to}
          min={period.from || undefined}
          onChange={(value) => changeDate("to", value)}
        />
      </div>
      {children}
    </FormSection>
  );
}

export default ReportPeriodPicker;
