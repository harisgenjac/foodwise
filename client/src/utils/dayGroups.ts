import type { TFunction } from "i18next";
import { daysFromToday, toDateInput } from "./expiry.js";

export interface DayGroup<T> {
  key: string;
  title: string;
  items: T[];
}

// "Wednesday, 22 October" (names from i18n, browsers lack Bosnian ones).
export const fullDate = (dateInput: string, t: TFunction) => {
  const date = new Date(`${dateInput}T00:00:00`);
  const weekdays = t("dashboard.weekdays", { returnObjects: true }) as string[];
  const months = t("dashboard.months", { returnObjects: true }) as string[];
  return t("dashboard.dateFormat", {
    weekday: weekdays[date.getDay()],
    day: date.getDate(),
    month: months[date.getMonth()],
  });
};

// Today, tomorrow or yesterday: the title is a word, not the date.
export const isRelativeDay = (dateInput: string) => Math.abs(daysFromToday(dateInput)) <= 1;

// "Today", "Tomorrow", "Yesterday" or "Wednesday, 22 October".
export const dayTitle = (dateInput: string, t: TFunction) => {
  const offset = daysFromToday(dateInput);
  if (offset === 0) return t("notifications.groups.today");
  if (offset === 1) return t("pickups.sections.tomorrow");
  if (offset === -1) return t("notifications.groups.yesterday");
  return fullDate(dateInput, t);
};

// Groups an already sorted list by local day, keeping the server order inside each day.
export const groupByDay = <T>(items: T[], dateOf: (item: T) => string, t: TFunction): DayGroup<T>[] => {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = toDateInput(new Date(dateOf(item)));
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, title: dayTitle(key, t), items: [item] });
    }
  }
  return groups;
};
