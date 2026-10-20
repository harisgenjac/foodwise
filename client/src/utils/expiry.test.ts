import { dateInDays, daysFromToday, getDaysUntilExpiry, toDateInput } from "./expiry.js";
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
});
