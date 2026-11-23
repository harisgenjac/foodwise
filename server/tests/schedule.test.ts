import { isOpenAt, localWeekdayAndTime, openStateAt, parseSchedule, WEEKDAYS, type Schedule } from "../src/utils/schedule.js";

const week = (hours: Schedule["mon"]) => Object.fromEntries(WEEKDAYS.map((day) => [day, hours])) as Schedule;

// Wednesday 2030-01-16 in Sarajevo (UTC+1 in winter).
const at = (time: string) => new Date(`2030-01-16T${time}:00+01:00`);

describe("weekly hours", () => {
  it("reads the weekday and time in the business time zone", () => {
    expect(localWeekdayAndTime(at("23:30"))).toEqual({ day: "wed", time: "23:30" });
    expect(localWeekdayAndTime(new Date("2030-01-16T23:30:00Z"))).toEqual({ day: "thu", time: "00:30" });
  });

  it("is open from the opening time until just before closing", () => {
    const schedule = week({ open: "08:00", close: "20:00" });
    expect(isOpenAt(schedule, at("07:59"))).toBe(false);
    expect(isOpenAt(schedule, at("08:00"))).toBe(true);
    expect(isOpenAt(schedule, at("19:59"))).toBe(true);
    expect(isOpenAt(schedule, at("20:00"))).toBe(false);
  });

  it("is closed on a closed day, open until midnight with 24:00, and unknown without hours", () => {
    expect(isOpenAt({ ...week({ open: "08:00", close: "20:00" }), wed: null }, at("12:00"))).toBe(false);
    expect(isOpenAt(week({ open: "00:00", close: "24:00" }), at("23:59"))).toBe(true);
    expect(isOpenAt(null, at("12:00"))).toBeNull();
  });

  it("gives the open state: until when today, or when it opens next", () => {
    const weekdays = { ...week({ open: "08:00", close: "20:00" }), sat: null, sun: null };
    expect(openStateAt(weekdays, at("12:00"))).toEqual({ open_now: true, closes_at: "20:00", opens_at: null, opens_on: null });
    expect(openStateAt(weekdays, at("07:00"))).toEqual({ open_now: false, closes_at: null, opens_at: "08:00", opens_on: "today" });
    expect(openStateAt(weekdays, at("21:00"))).toEqual({ open_now: false, closes_at: null, opens_at: "08:00", opens_on: "tomorrow" });
    // Wednesday evening, open again only on Monday.
    expect(openStateAt({ ...week(null), mon: { open: "09:00", close: "17:00" } }, at("21:00"))).toMatchObject({
      open_now: false,
      opens_at: "09:00",
      opens_on: "mon",
    });
    expect(openStateAt(week(null), at("12:00"))).toEqual({ open_now: false, closes_at: null, opens_at: null, opens_on: null });
    expect(openStateAt(null, at("12:00"))).toEqual({ open_now: null, closes_at: null, opens_at: null, opens_on: null });
  });

  it("parses a schedule: not sent, null, valid, invalid", () => {
    expect(parseSchedule(undefined)).toBeUndefined();
    expect(parseSchedule(null)).toEqual({ value: null });
    expect(parseSchedule(week({ open: "06:30", close: "24:00" }))).toEqual({ value: week({ open: "06:30", close: "24:00" }) });
    expect(parseSchedule("08-20")).toEqual({ invalid: true });
  });
});
