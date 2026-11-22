import type { TFunction } from "i18next";

const DAY_MS = 24 * 60 * 60 * 1000;

// A time on the store home page in the interface language: "danas u 12:30", "sutra u 9:00",
// otherwise the day, month and time ("25. 11. 14:00").
export const dayAndTime = (value: string | Date, now: number, t: TFunction, language: string) => {
  const date = new Date(value);
  const locale = language === "bs" ? "bs-BA" : "en-GB";
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (date.toDateString() === new Date(now).toDateString()) return t("storeHome.orders.todayAt", { time });
  if (date.toDateString() === new Date(now + DAY_MS).toDateString()) return t("storeHome.orders.tomorrowAt", { time });
  return date.toLocaleString(locale, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
};
