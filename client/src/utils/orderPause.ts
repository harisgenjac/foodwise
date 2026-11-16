import type { TFunction } from "i18next";
import type { StorePause } from "../types/index.js";

// A store's pause on new orders (PATCH /users/me/order-settings): the lengths a store picks from,
// and how the end is shown. The server counts a passed end as no pause.

export const PAUSE_OPTIONS = ["30m", "1h", "2h", "4h", "endOfDay", "untilResumed"] as const;
export type PauseOption = (typeof PAUSE_OPTIONS)[number];

const MINUTES: Partial<Record<PauseOption, number>> = { "30m": 30, "1h": 60, "2h": 120, "4h": 240 };

// The preparation times a store can choose (the server's list), in minutes.
export const PREPARATION_MINUTES = [15, 30, 45, 60, 90, 120] as const;

// When a pause of this length ends, as an ISO time; null = until the store switches it off.
// "End of day" is the coming local midnight.
export function pauseUntil(option: PauseOption, now: Date = new Date()): string | null {
  if (option === "untilResumed") return null;
  if (option === "endOfDay") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  }
  return new Date(now.getTime() + MINUTES[option]! * 60 * 1000).toISOString();
}

const pad = (value: number) => String(value).padStart(2, "0");

// "do 14:30" today, "do 17.11. u 14:30" on another day, "dok je ne isključite" without an end.
export function formatPauseEnd(until: string | null, t: TFunction, now: Date = new Date()): string {
  if (!until) return t("orderPause.untilResumed");
  const end = new Date(until);
  const time = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  const sameDay =
    end.getFullYear() === now.getFullYear() && end.getMonth() === now.getMonth() && end.getDate() === now.getDate();
  if (sameDay) return t("orderPause.untilTime", { time });
  // Midnight reads better as the end of the day before.
  if (time === "00:00") {
    const dayBefore = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    const isToday =
      dayBefore.getFullYear() === now.getFullYear() &&
      dayBefore.getMonth() === now.getMonth() &&
      dayBefore.getDate() === now.getDate();
    if (isToday) return t("orderPause.untilEndOfDay");
  }
  return t("orderPause.untilDate", { date: `${pad(end.getDate())}.${pad(end.getMonth() + 1)}.`, time });
}

// Whether the pause is on now (the server already drops a passed end, but a page can stay open).
export function isPaused(pause: Partial<StorePause> | null | undefined, now: Date = new Date()): boolean {
  if (!pause?.orders_paused) return false;
  return !pause.orders_paused_until || new Date(pause.orders_paused_until).getTime() > now.getTime();
}
