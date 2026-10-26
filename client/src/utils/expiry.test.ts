import {
  dateInDays,
  daysFromToday,
  formatDisplayDate,
  getDaysUntilExpiry,
  parseDisplayDate,
  parseTimeInput,
  toDateInput,
} from "./expiry.js";
import { makeProduct } from "../test/utils.js";

describe("expiry utils", () => {
  beforeEach(() => {
    // 20 Oct 2026, 23:30 local time: late enough that a UTC conversion would change the date in UTC+ zones.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 23, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats a date as local YYYY-MM-DD", () => {
    expect(toDateInput(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("returns dates relative to today, across month ends", () => {
    expect(dateInDays(0)).toBe("2026-10-20");
    expect(dateInDays(12)).toBe("2026-11-01");
  });

  it("shows a date as dd/mm/yyyy", () => {
    expect(formatDisplayDate("2026-03-05")).toBe("05/03/2026");
    expect(formatDisplayDate("")).toBe("");
  });

  it("reads dd/mm/yyyy, also with single digits and other separators", () => {
    expect(parseDisplayDate("05/03/2026")).toBe("2026-03-05");
    expect(parseDisplayDate(" 5/3/2026 ")).toBe("2026-03-05");
    expect(parseDisplayDate("5.3.2026")).toBe("2026-03-05");
    expect(parseDisplayDate("29-02-2028")).toBe("2028-02-29");
    expect(parseDisplayDate(formatDisplayDate("2026-12-31"))).toBe("2026-12-31");
  });

  it("rejects impossible dates and other text", () => {
    for (const text of ["31/02/2026", "29/02/2027", "13/13/2026", "00/01/2026", "2026-03-05", "05/03/26", "abc", ""]) {
      expect(parseDisplayDate(text)).toBeNull();
    }
  });

  it("counts whole days from today", () => {
    expect(daysFromToday("2026-10-20")).toBe(0);
    expect(daysFromToday("2026-10-23")).toBe(3);
    expect(daysFromToday("2026-10-19")).toBe(-1);
  });

  it("prefers the server-computed days_until_expiry", () => {
    expect(getDaysUntilExpiry(makeProduct({ days_until_expiry: 7, expiry_date: "2026-10-21" }))).toBe(7);
  });

  it("falls back to the expiry date", () => {
    const { days_until_expiry: _unused, ...product } = makeProduct({ expiry_date: "2026-10-22" });
    expect(getDaysUntilExpiry(product)).toBe(2);
  });

  it("reads a typed 24-hour time as HH:MM", () => {
    expect(parseTimeInput("14:30")).toBe("14:30");
    expect(parseTimeInput("14.30")).toBe("14:30");
    expect(parseTimeInput("1430")).toBe("14:30");
    expect(parseTimeInput("930")).toBe("09:30");
    expect(parseTimeInput("9:05")).toBe("09:05");
    expect(parseTimeInput("9")).toBe("09:00");
    expect(parseTimeInput("0")).toBe("00:00");
    expect(parseTimeInput("23:59")).toBe("23:59");
    expect(parseTimeInput(" 08:15 ")).toBe("08:15");
  });

  it("rejects a time outside 00:00-23:59 or in another format", () => {
    for (const text of ["24:00", "12:60", "9:5", "12345", "2pm", "ab", "", "  "]) {
      expect(parseTimeInput(text)).toBeNull();
    }
  });
});
