import type { TFunction } from "i18next";
import { WEEKDAYS, todayWeekday, type DayHours, type Schedule, type Weekday } from "./schedule.js";
import type { SearchStore } from "../types/index.js";

// Whether a store is open now by its weekly hours, and when that changes:
// open until `closes`, or closed and opening at `opensAt` (today, tomorrow or on `day`), or closed
// with no opening day at all. Null without weekly hours (nothing is shown then).
export type OpenState =
  | { open: true; closes: string }
  | { open: false; opensAt: string; when: "today" | "tomorrow" | Weekday }
  | { open: false; opensAt: null };

const timeOf = (now: Date) => `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

// The browser's local time, like `todayWeekday` (the app's users are in Bosnia; the server's
// `open_now` uses APP_TIMEZONE, the same zone).
export function openState(schedule: Schedule | null | undefined, now: Date = new Date()): OpenState | null {
  if (!schedule) return null;
  const today = todayWeekday(now);
  const time = timeOf(now);
  const hours = schedule[today];
  if (hours && hours.open <= time && time < hours.close) return { open: true, closes: hours.close };
  if (hours && time < hours.open) return { open: false, opensAt: hours.open, when: "today" };
  const start = WEEKDAYS.indexOf(today);
  for (let offset = 1; offset <= 7; offset++) {
    const day = WEEKDAYS[(start + offset) % 7]!;
    const next = schedule[day];
    if (next) return { open: false, opensAt: next.open, when: offset === 1 ? "tomorrow" : day };
  }
  return { open: false, opensAt: null };
}

// "07:00 – 22:00" (the store page's info row and week popover).
export const hoursRange = (hours: NonNullable<DayHours>) => `${hours.open} – ${hours.close}`;

// The line after "Otvoreno" / "Zatvoreno": "do 22:00", "otvara u 08:00", "otvara sutra u 08:00",
// "otvara u ponedjeljak u 08:00"; empty when the store never opens.
export function openStateDetail(state: OpenState, t: TFunction): string {
  if (state.open) return t("storeHours.until", { time: state.closes });
  if (state.opensAt === null) return "";
  if (state.when === "today") return t("storeHours.opensAt", { time: state.opensAt });
  if (state.when === "tomorrow") return t("storeHours.opensTomorrow", { time: state.opensAt });
  return t("storeHours.opensOn", { day: t(`storeHours.onDay.${state.when}`), time: state.opensAt });
}

// "Otvoreno · do 22:00" / "Zatvoreno · otvara u 08:00" as one string.
export function openStateText(state: OpenState, t: TFunction): string {
  const label = state.open ? t("storeHours.open") : t("storeHours.closed");
  const detail = openStateDetail(state, t);
  return detail ? `${label} · ${detail}` : label;
}

// The open state the server worked out for a list (Search's open_now, closes_at, opens_at,
// opens_on), in the same shape; null without weekly hours.
export function serverOpenState(store: Pick<SearchStore, "open_now" | "closes_at" | "opens_at" | "opens_on">): OpenState | null {
  if (store.open_now === null) return null;
  if (store.open_now) return { open: true, closes: store.closes_at ?? "" };
  if (store.opens_at && store.opens_on) return { open: false, opensAt: store.opens_at, when: store.opens_on };
  return { open: false, opensAt: null };
}
