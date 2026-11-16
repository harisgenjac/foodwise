import { parseReadyAt, READY_TIME_INVALID, READY_TIME_REQUIRED } from "../src/utils/readyTime.js";
import type { Schedule } from "../src/utils/schedule.js";

// Monday Nov 16, 2026, 11:00 in Sarajevo (10:00 UTC).
const NOW = new Date("2026-11-16T10:00:00.000Z");

const closingAt = (close: string): Schedule => ({
  mon: { open: "08:00", close },
  tue: null,
  wed: null,
  thu: null,
  fri: null,
  sat: null,
  sun: null,
});

describe("parseReadyAt", () => {
  it("accepts a time later today, with Z or an offset", () => {
    expect(parseReadyAt("2026-11-16T10:30:00.000Z", null, NOW)).toEqual({ readyAt: new Date("2026-11-16T10:30:00.000Z") });
    expect(parseReadyAt("2026-11-16T11:45:00+01:00", null, NOW)).toEqual({ readyAt: new Date("2026-11-16T10:45:00.000Z") });
    // Up to two minutes in the past (the time it took to send the dialog).
    expect(parseReadyAt("2026-11-16T09:59:00.000Z", null, NOW).error).toBeUndefined();
  });

  it("needs a time", () => {
    for (const value of [undefined, null, ""]) {
      expect(parseReadyAt(value, null, NOW)).toEqual({ error: READY_TIME_REQUIRED });
    }
  });

  it("refuses the past, another day, a time without a zone and anything that is no time", () => {
    for (const value of [
      "2026-11-16T09:50:00.000Z", // 10 minutes ago
      "2026-11-16T23:30:00.000Z", // 00:30 tomorrow in Sarajevo
      "2026-11-17T08:00:00.000Z",
      "2026-11-16T12:00:00",
      "soon",
      30,
    ]) {
      expect(parseReadyAt(value, null, NOW)).toEqual({ error: READY_TIME_INVALID });
    }
  });

  it("must be before the store closes today", () => {
    expect(parseReadyAt("2026-11-16T10:30:00.000Z", closingAt("12:00"), NOW).error).toBeUndefined(); // 11:30
    expect(parseReadyAt("2026-11-16T11:00:00.000Z", closingAt("12:00"), NOW).error).toBeUndefined(); // 12:00
    expect(parseReadyAt("2026-11-16T11:30:00.000Z", closingAt("12:00"), NOW)).toEqual({ error: READY_TIME_INVALID });
    expect(parseReadyAt("2026-11-16T22:00:00.000Z", closingAt("24:00"), NOW).error).toBeUndefined(); // 23:00
  });
});
