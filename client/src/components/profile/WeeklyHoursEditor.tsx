import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { DEFAULT_DAY_HOURS, newSchedule, WEEKDAYS, type Schedule, type Weekday } from "../../utils/schedule.js";

interface WeeklyHoursEditorProps {
  label: string;
  // null: not entered yet (nothing is saved until the business changes something).
  value: Schedule | null;
  onChange: (value: Schedule) => void;
}

// Two time inputs share a phone's width, so they shrink (no icon padding as in inputStyle).
const timeInput =
  "min-h-11 w-full min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-2 py-2 text-center text-base text-neutral-900 tabular-nums transition-colors focus:border-brand-800 focus:outline-none focus:ring-4 focus:ring-brand-100 sm:min-h-0 sm:text-sm";

// One row per weekday: an "open" switch and the opening and closing time (one interval a day, no
// overnight hours). "Copy Monday to every day" fills the week from the first row.
function WeeklyHoursEditor({ label, value, onChange }: WeeklyHoursEditorProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const schedule = value ?? newSchedule();
  const notEntered = value === null;

  const setDay = (day: Weekday, hours: Schedule[Weekday]) => onChange({ ...schedule, [day]: hours });
  const copyMonday = () =>
    onChange(Object.fromEntries(WEEKDAYS.map((day) => [day, schedule.mon ? { ...schedule.mon } : null])) as Schedule);

  return (
    <fieldset aria-labelledby={labelId} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend id={labelId} className="text-sm font-medium text-neutral-700">
          {label}
        </legend>
        <button
          type="button"
          onClick={copyMonday}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-brand-800 hover:bg-brand-50 sm:min-h-0 sm:py-1"
        >
          <Copy className="h-3.5 w-3.5" />
          {t("schedule.copyMonday")}
        </button>
      </div>
      {notEntered && (
        <p className="rounded-xl bg-warning-50 px-3 py-2 text-xs text-warning-800">
          {t("schedule.notEntered")}
        </p>
      )}
      <ul className="space-y-2">
        {WEEKDAYS.map((day) => {
          const hours = schedule[day];
          const dayName = t(`schedule.days.${day}`);
          return (
            <li key={day} className="flex flex-col gap-1 sm:grid sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center sm:gap-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={hours !== null}
                  onChange={(e) => setDay(day, e.target.checked ? { ...DEFAULT_DAY_HOURS } : null)}
                  aria-label={t("schedule.openOn", { day: dayName })}
                  className="h-4 w-4 accent-brand-800"
                />
                <span className="font-medium">{dayName}</span>
              </label>
              {hours ? (
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="time"
                    value={hours.open}
                    onChange={(e) => e.target.value && setDay(day, { ...hours, open: e.target.value })}
                    aria-label={t("schedule.opensAt", { day: dayName })}
                    className={timeInput}
                  />
                  <span className="text-neutral-500">–</span>
                  <input
                    type="time"
                    // 24:00 (open until midnight) shows as 00:00 in a time input.
                    value={hours.close === "24:00" ? "00:00" : hours.close}
                    onChange={(e) =>
                      e.target.value && setDay(day, { ...hours, close: e.target.value === "00:00" ? "24:00" : e.target.value })
                    }
                    aria-label={t("schedule.closesAt", { day: dayName })}
                    className={timeInput}
                  />
                </div>
              ) : (
                <span className="pb-2 text-sm text-neutral-500 sm:pb-0">{t("schedule.closed")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export default WeeklyHoursEditor;
