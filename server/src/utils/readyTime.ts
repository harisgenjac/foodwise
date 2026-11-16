import { APP_TIMEZONE, isValidDateTime } from "./dates.js";
import { localWeekdayAndTime, type Schedule } from "./schedule.js";

// When a store says a delivery order will be ready (accepting it, delivery phase 2): today, from
// now on, and before the store closes by its weekly hours (no weekly hours: any time today).

export const READY_TIME_REQUIRED = "Choose when the order will be ready.";
export const READY_TIME_INVALID = "The ready time must be later today, before the store closes.";

// A little slack for the time it took to send the dialog.
const PAST_SLACK_MS = 2 * 60 * 1000;

// The local calendar day of an instant in the business time zone ("2026-11-16").
const localDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );

const hasZone = (value: string) => /(Z|[+-]\d{2}:?\d{2})$/.test(value);

// Parses `ready_at` (an ISO date-time with Z or an offset). Returns the instant or an error text.
export const parseReadyAt = (
  value: unknown,
  schedule: Schedule | null,
  now: Date = new Date(),
): { readyAt: Date; error?: never } | { error: string; readyAt?: never } => {
  if (value === undefined || value === null || value === "") return { error: READY_TIME_REQUIRED };
  if (!isValidDateTime(value) || !hasZone(value)) return { error: READY_TIME_INVALID };
  const readyAt = new Date(value);
  if (readyAt.getTime() < now.getTime() - PAST_SLACK_MS || localDay(readyAt) !== localDay(now)) {
    return { error: READY_TIME_INVALID };
  }
  const hours = schedule?.[localWeekdayAndTime(readyAt).day];
  if (hours && localWeekdayAndTime(readyAt).time > hours.close) return { error: READY_TIME_INVALID };
  return { readyAt };
};
