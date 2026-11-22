import { openState, openStateText } from "./storeHours.js";
import { WEEKDAYS, type Schedule } from "./schedule.js";
import { t } from "../test/utils.js";

const hours = { open: "08:00", close: "20:00" };
const weekdays = Object.fromEntries(WEEKDAYS.map((day) => [day, day === "sat" || day === "sun" ? null : hours])) as Schedule;
// Wednesday 2026-11-18 and Friday 2026-11-20, local time.
const at = (day: number, time: string) => new Date(`2026-11-${day}T${time}:00`);

describe("openState", () => {
  it("is open until the closing time", () => {
    expect(openState(weekdays, at(18, "10:00"))).toEqual({ open: true, closes: "20:00" });
    expect(openStateText(openState(weekdays, at(18, "10:00"))!, t)).toBe("Otvoreno · do 20:00");
  });

  it("opens later today before the opening time", () => {
    expect(openStateText(openState(weekdays, at(18, "06:30"))!, t)).toBe("Zatvoreno · otvara u 08:00");
  });

  it("opens tomorrow after closing", () => {
    expect(openStateText(openState(weekdays, at(18, "21:00"))!, t)).toBe("Zatvoreno · otvara sutra u 08:00");
  });

  it("names the day when the next opening is later", () => {
    expect(openState(weekdays, at(20, "21:00"))).toEqual({ open: false, opensAt: "08:00", when: "mon" });
    expect(openStateText(openState(weekdays, at(20, "21:00"))!, t)).toBe("Zatvoreno · otvara u ponedjeljak u 08:00");
  });

  it("is closed with no opening for a week without hours, and nothing without a schedule", () => {
    const closed = Object.fromEntries(WEEKDAYS.map((day) => [day, null])) as Schedule;
    expect(openStateText(openState(closed, at(18, "10:00"))!, t)).toBe("Zatvoreno");
    expect(openState(null)).toBeNull();
  });
});
