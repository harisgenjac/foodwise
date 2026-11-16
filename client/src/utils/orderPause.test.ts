import { formatPauseEnd, isPaused, pauseUntil } from "./orderPause.js";
import { t } from "../test/utils.js";

// Local times, like the store's own clock.
const NOW = new Date(2026, 10, 16, 10, 15);

describe("pauseUntil", () => {
  it("adds the chosen length, ends the day at midnight, or has no end", () => {
    expect(pauseUntil("30m", NOW)).toBe(new Date(2026, 10, 16, 10, 45).toISOString());
    expect(pauseUntil("4h", NOW)).toBe(new Date(2026, 10, 16, 14, 15).toISOString());
    expect(pauseUntil("endOfDay", NOW)).toBe(new Date(2026, 10, 17, 0, 0).toISOString());
    expect(pauseUntil("untilResumed", NOW)).toBeNull();
  });
});

describe("formatPauseEnd", () => {
  it("shows the time today, the date on another day, and the end of today at midnight", () => {
    expect(formatPauseEnd(new Date(2026, 10, 16, 14, 5).toISOString(), t, NOW)).toBe(
      t("orderPause.untilTime", { time: "14:05" }),
    );
    expect(formatPauseEnd(new Date(2026, 10, 18, 9, 0).toISOString(), t, NOW)).toBe(
      t("orderPause.untilDate", { date: "18.11.", time: "09:00" }),
    );
    expect(formatPauseEnd(new Date(2026, 10, 17, 0, 0).toISOString(), t, NOW)).toBe(t("orderPause.untilEndOfDay"));
    expect(formatPauseEnd(null, t, NOW)).toBe(t("orderPause.untilResumed"));
  });
});

describe("isPaused", () => {
  it("is on without an end or before it, and off after it", () => {
    expect(isPaused({ orders_paused: true, orders_paused_until: null }, NOW)).toBe(true);
    expect(isPaused({ orders_paused: true, orders_paused_until: new Date(2026, 10, 16, 11).toISOString() }, NOW)).toBe(true);
    expect(isPaused({ orders_paused: true, orders_paused_until: new Date(2026, 10, 16, 10).toISOString() }, NOW)).toBe(false);
    expect(isPaused({ orders_paused: false, orders_paused_until: null }, NOW)).toBe(false);
    expect(isPaused(null, NOW)).toBe(false);
  });
});
