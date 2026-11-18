import type { TFunction } from "i18next";

// Weekly opening and pickup hours, as the server stores them (users.opening_schedule,
// users.pickup_schedule): one entry per weekday, null for a closed day. Keep in sync with
// server/src/utils/schedule.ts.
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type DayHours = { open: string; close: string } | null;
export type Schedule = Record<Weekday, DayHours>;

export const DEFAULT_DAY_HOURS = { open: "08:00", close: "20:00" };

// A new schedule: every day open with the default hours.
export const newSchedule = (): Schedule =>
  Object.fromEntries(WEEKDAYS.map((day) => [day, { ...DEFAULT_DAY_HOURS }])) as Schedule;

// Today's weekday in the browser's time zone (the app's users are in Bosnia).
export const todayWeekday = (now = new Date()): Weekday => WEEKDAYS[(now.getDay() + 6) % 7]!;

export const dayHoursText = (hours: DayHours, t: TFunction) =>
  hours ? `${hours.open}–${hours.close}` : t("schedule.closed");

// Consecutive days with the same hours, e.g. [{ days: "Pon–Pet", hours: "08:00–20:00" }, ...].
export const scheduleLines = (schedule: Schedule, t: TFunction) => {
  const lines: { from: Weekday; to: Weekday; hours: DayHours }[] = [];
  for (const day of WEEKDAYS) {
    const hours = schedule[day];
    const last = lines[lines.length - 1];
    if (last && JSON.stringify(last.hours) === JSON.stringify(hours)) {
      last.to = day;
    } else {
      lines.push({ from: day, to: day, hours });
    }
  }
  return lines.map((line) => ({
    days:
      line.from === line.to
        ? t(`schedule.short.${line.from}`)
        : `${t(`schedule.short.${line.from}`)}–${t(`schedule.short.${line.to}`)}`,
    hours: dayHoursText(line.hours, t),
  }));
};

// The hours as one line ("Pon–Pet 08:00–20:00 · Sub 09:00–14:00 · Ned zatvoreno"); null when the
// business has not entered weekly hours yet.
export const hoursText = (schedule: Schedule | null | undefined, t: TFunction) =>
  schedule ? scheduleLines(schedule, t).map((line) => `${line.days} ${line.hours}`).join(" · ") : null;

// Weekly hours a form can send: every open day must close after it opens.
export const isScheduleValid = (schedule: Schedule | null) =>
  schedule === null || WEEKDAYS.every((day) => !schedule[day] || schedule[day]!.open < schedule[day]!.close);
