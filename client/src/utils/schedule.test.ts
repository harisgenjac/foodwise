import i18n from "../i18n/config.js";
import { hoursText, isScheduleValid, scheduleLines, todayWeekday, WEEKDAYS, type Schedule } from "./schedule.js";

const t = i18n.t.bind(i18n);
const week = (hours: Schedule["mon"]) => Object.fromEntries(WEEKDAYS.map((day) => [day, hours])) as Schedule;
const HOURS = { open: "08:00", close: "20:00" };

describe("weekly hours", () => {
  it("groups consecutive days with the same hours", () => {
    const schedule = { ...week(HOURS), sat: { open: "09:00", close: "14:00" }, sun: null };
    expect(scheduleLines(schedule, t)).toEqual([
      { days: "Pon–Pet", hours: "08:00–20:00" },
      { days: "Sub", hours: "09:00–14:00" },
      { days: "Ned", hours: "zatvoreno" },
    ]);
    expect(hoursText(week(HOURS), null, t)).toBe("Pon–Ned 08:00–20:00");
  });

  it("falls back to the old text, then to nothing", () => {
    expect(hoursText(null, "07-22", t)).toBe("07-22");
    expect(hoursText(null, "  ", t)).toBeNull();
    expect(hoursText(undefined, undefined, t)).toBeNull();
  });

  it("checks that every open day closes after it opens", () => {
    expect(isScheduleValid(null)).toBe(true);
    expect(isScheduleValid(week(HOURS))).toBe(true);
    expect(isScheduleValid({ ...week(HOURS), mon: { open: "20:00", close: "08:00" } })).toBe(false);
    expect(isScheduleValid(week({ open: "06:00", close: "24:00" }))).toBe(true);
  });

  it("names today's weekday from Monday", () => {
    expect(todayWeekday(new Date(2030, 0, 13))).toBe("sun");
    expect(todayWeekday(new Date(2030, 0, 14))).toBe("mon");
  });
});
