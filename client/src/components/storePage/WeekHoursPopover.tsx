import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { WEEKDAYS, todayWeekday, type Schedule } from "../../utils/schedule.js";
import { hoursRange } from "../../utils/storeHours.js";

interface WeekHoursPopoverProps {
  schedule: Schedule;
  // Names the button and the popover, e.g. "Radno vrijeme".
  title: string;
}

// "Cijela sedmica" under a day's hours on the store page: a link-styled button that opens a small
// popover with all seven days (today highlighted, a closed day as "Zatvoreno"). It closes on
// Escape (focus back on the button), on a click outside and on the button again.
function WeekHoursPopover({ schedule, title }: WeekHoursPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const today = todayWeekday();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={t("storePage.wholeWeekLabel", { title })}
        onClick={() => setOpen((value) => !value)}
        // 44 px tap area around the short link text.
        className="relative cursor-pointer font-bold text-brand-800 underline underline-offset-[3px] after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-[''] hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800"
      >
        {t("storePage.wholeWeek")}
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={title}
          data-testid="week-hours"
          className="absolute top-full left-0 z-30 mt-2 w-60 rounded-2xl border border-[#EEEDEB] bg-white p-3 text-sm shadow-[0_12px_32px_rgba(28,25,23,0.16)]"
        >
          <p className="mb-1.5 px-2 text-[13px] font-bold text-neutral-600">{title}</p>
          <ul>
            {WEEKDAYS.map((day) => {
              const hours = schedule[day];
              const isToday = day === today;
              return (
                <li
                  key={day}
                  aria-current={isToday ? "date" : undefined}
                  className={`flex justify-between gap-3 rounded-lg px-2 py-1.5 ${isToday ? "bg-brand-50 font-bold text-brand-800" : "text-neutral-900"}`}
                >
                  <span>{t(`schedule.days.${day}`)}</span>
                  <span className={`tabular-nums ${hours ? "" : "text-neutral-600"}`}>
                    {hours ? hoursRange(hours) : t("storePage.closedDay")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </span>
  );
}

export default WeekHoursPopover;
