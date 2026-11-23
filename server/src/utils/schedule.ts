import { APP_TIMEZONE } from "./dates.js";

// Weekly opening and pickup hours (users.opening_schedule, users.pickup_schedule): one entry per
// weekday, null for a closed day, or one interval within the day (no overnight hours):
//   { mon: { open: "08:00", close: "20:00" }, ..., sun: null }
// Keep in sync with client/src/utils/schedule.ts.
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type DayHours = { open: string; close: string } | null;
export type Schedule = Record<Weekday, DayHours>;

// HH:MM from 00:00 to 23:59, or 24:00 as a closing time (open until midnight).
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isTime = (value: unknown, allowMidnight: boolean): value is string =>
  typeof value === "string" && (TIME.test(value) || (allowMidnight && value === "24:00"));

const parseDay = (value: unknown): DayHours | undefined => {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const { open, close, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || !isTime(open, false) || !isTime(close, true)) return undefined;
  // Both are HH:MM, so string order is time order.
  if (open >= close) return undefined;
  return { open, close };
};

// A schedule sent with a profile: undefined when the field was not sent (keep the stored one),
// null to clear it, otherwise every weekday must be there and valid.
export const parseSchedule = (value: unknown): { value: Schedule | null } | { invalid: true } | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return { value: null };
  if (typeof value !== "object" || Array.isArray(value)) return { invalid: true };
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !(WEEKDAYS as readonly string[]).includes(key))) return { invalid: true };
  const schedule = {} as Schedule;
  for (const day of WEEKDAYS) {
    if (!(day in input)) return { invalid: true };
    const hours = parseDay(input[day]);
    if (hours === undefined) return { invalid: true };
    schedule[day] = hours;
  }
  return { value: schedule };
};

// The weekday and HH:MM of `now` in the business time zone.
export const localWeekdayAndTime = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const day = part("weekday").toLowerCase().slice(0, 3) as Weekday;
  return { day, time: `${part("hour")}:${part("minute")}` };
};

// Whether the schedule is open at `now`; null without a schedule (nothing to say).
export const isOpenAt = (schedule: Schedule | null | undefined, now = new Date()): boolean | null => {
  if (!schedule) return null;
  const { day, time } = localWeekdayAndTime(now);
  const hours = schedule[day];
  return hours ? hours.open <= time && time < hours.close : false;
};

// A store's open state for a list (Search): open now and until when today, or closed and when it
// opens next ("today", "tomorrow" or the weekday within the coming week; null when it never
// opens). All null without weekly hours (nothing to say, and nothing is blocked).
export type OpenState = {
  open_now: boolean | null;
  closes_at: string | null;
  opens_at: string | null;
  opens_on: "today" | "tomorrow" | Weekday | null;
};

export const openStateAt = (schedule: Schedule | null | undefined, now = new Date()): OpenState => {
  const state: OpenState = { open_now: null, closes_at: null, opens_at: null, opens_on: null };
  if (!schedule) return state;
  const { day, time } = localWeekdayAndTime(now);
  const hours = schedule[day];
  if (hours && hours.open <= time && time < hours.close) return { ...state, open_now: true, closes_at: hours.close };
  if (hours && time < hours.open) return { ...state, open_now: false, opens_at: hours.open, opens_on: "today" };
  const start = WEEKDAYS.indexOf(day);
  for (let offset = 1; offset <= 7; offset += 1) {
    const next = WEEKDAYS[(start + offset) % 7]!;
    const nextHours = schedule[next];
    if (nextHours) return { ...state, open_now: false, opens_at: nextHours.open, opens_on: offset === 1 ? "tomorrow" : next };
  }
  return { ...state, open_now: false };
};
