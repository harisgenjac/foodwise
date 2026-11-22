import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Copy } from "lucide-react";
import FieldError from "../form/FieldError.js";
import { Switch } from "./ui.js";
import { DEFAULT_DAY_HOURS, newSchedule, WEEKDAYS, type Schedule, type Weekday } from "../../utils/schedule.js";

const timeInput =
  "min-h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-white py-2 pr-2 pl-9 text-base text-neutral-900 tabular-nums focus:border-brand-800 focus:ring-4 focus:ring-brand-100 focus:outline-none sm:text-sm";

interface HoursTableProps {
  title: string;
  // null: not entered yet (nothing is saved until the business changes something).
  value: Schedule | null;
  onChange: (value: Schedule) => void;
  error?: string | undefined;
  testId: string;
}

// One week of hours: a row per day with a switch, the day and from–until times ("Zatvoreno" for a
// day switched off), and "Kopiraj ponedjeljak na sve dane".
export function HoursTable({ title, value, onChange, error, testId }: HoursTableProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const errorId = useId();
  const schedule = value ?? newSchedule();
  const setDay = (day: Weekday, hours: Schedule[Weekday]) => onChange({ ...schedule, [day]: hours });
  const copyMonday = () =>
    onChange(Object.fromEntries(WEEKDAYS.map((day) => [day, schedule.mon ? { ...schedule.mon } : null])) as Schedule);

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={error ? errorId : undefined}
      data-testid={testId}
      data-invalid={error ? true : undefined}
      className="min-w-0"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-xs font-bold tracking-wide text-neutral-700 uppercase">
          {title}
        </h3>
        <button
          type="button"
          onClick={copyMonday}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-800 hover:bg-brand-50"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          {t("schedule.copyMonday")}
        </button>
      </div>
      {value === null && (
        <p className="mb-3 rounded-xl bg-warning-50 px-3 py-2 text-xs text-warning-800">{t("schedule.notEntered")}</p>
      )}
      <ul className="divide-y divide-neutral-100">
        {WEEKDAYS.map((day) => {
          const hours = schedule[day];
          const dayName = t(`schedule.days.${day}`);
          return (
            <li key={day} data-testid={`hours-row-${day}`} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[auto_7rem_minmax(0,1fr)]">
              <Switch
                checked={hours !== null}
                onChange={(open) => setDay(day, open ? { ...DEFAULT_DAY_HOURS } : null)}
                label={t("schedule.openOn", { day: dayName })}
              />
              <span className="text-sm font-semibold text-neutral-900">{dayName}</span>
              {hours ? (
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                  <span className="relative min-w-0 flex-1">
                    <Clock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
                    <input
                      type="time"
                      value={hours.open}
                      onChange={(e) => e.target.value && setDay(day, { ...hours, open: e.target.value })}
                      aria-label={t("schedule.opensAt", { day: dayName })}
                      className={timeInput}
                    />
                  </span>
                  <span className="text-neutral-500" aria-hidden="true">
                    –
                  </span>
                  <span className="relative min-w-0 flex-1">
                    <Clock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
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
                  </span>
                </div>
              ) : (
                <span data-testid="hours-closed" className="col-span-2 text-sm font-medium text-neutral-600 sm:col-span-1">
                  {t("profile.hours.closed")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

interface HoursSectionProps {
  isStore: boolean;
  opening: Schedule | null;
  pickup: Schedule | null;
  onOpening: (value: Schedule) => void;
  onPickup: (value: Schedule) => void;
  openingError?: string | undefined;
  pickupError?: string | undefined;
}

// "Radno vrijeme" (a restaurant: one table, "Dani i sati") or "Radno vrijeme i preuzimanje" (a
// store: its opening and pickup hours side by side, stacked on a phone).
function HoursSection({ isStore, opening, pickup, onOpening, onPickup, openingError, pickupError }: HoursSectionProps) {
  const { t } = useTranslation();
  if (!isStore) {
    return (
      <div className="max-w-2xl">
        <HoursTable title={t("profile.hours.daysAndHours")} value={opening} onChange={onOpening} error={openingError} testId="hours-opening" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <HoursTable title={t("profile.hours.opening")} value={opening} onChange={onOpening} error={openingError} testId="hours-opening" />
      <HoursTable title={t("profile.hours.pickup")} value={pickup} onChange={onPickup} error={pickupError} testId="hours-pickup" />
    </div>
  );
}

export default HoursSection;
