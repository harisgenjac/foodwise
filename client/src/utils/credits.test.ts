import {
  creditMonthEnd,
  currentCreditMonth,
  formatCreditMonth,
  getCreditError,
  nextCreditMonth,
  usageBarColor,
  usagePercent,
} from "./credits.js";
import { axiosError, creditError } from "../test/utils.js";

describe("getCreditError", () => {
  it("reads the 402 INSUFFICIENT_CREDITS body", () => {
    expect(getCreditError(creditError(true))).toEqual({ hasActiveSubscription: true, actionUrl: "/my-profile#topup" });
    expect(getCreditError(creditError(false))).toEqual({
      hasActiveSubscription: false,
      actionUrl: "/my-profile#subscription",
    });
  });

  it("ignores every other error", () => {
    expect(getCreditError(axiosError(400, "Not enough product available."))).toBeNull();
    expect(getCreditError(axiosError(402, "Something else"))).toBeNull();
    expect(getCreditError(new Error("network"))).toBeNull();
  });
});

describe("usage bar", () => {
  it("is green up to 70%, orange above 70% and below 90%, red from 90%", () => {
    expect(usageBarColor(0)).toBe("bg-green-500");
    expect(usageBarColor(70)).toBe("bg-green-500");
    expect(usageBarColor(70.01)).toBe("bg-orange-500");
    expect(usageBarColor(89.99)).toBe("bg-orange-500");
    expect(usageBarColor(90)).toBe("bg-red-500");
    expect(usageBarColor(100)).toBe("bg-red-500");
  });

  it("computes the used share, 0 without credits", () => {
    expect(usagePercent(10, 50)).toBe(20);
    expect(usagePercent(0, 0)).toBe(0);
    expect(usagePercent(7, 5)).toBe(100);
  });
});

describe("credit months", () => {
  it("change at 00:00 London time", () => {
    expect(currentCreditMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-01");
    expect(currentCreditMonth(new Date("2026-11-01T00:30:00Z"))).toBe("2026-11-01");
    // Summer time: 23:30 UTC on 31 July is already 1 August in London.
    expect(currentCreditMonth(new Date("2026-07-31T23:30:00Z"))).toBe("2026-08-01");
  });

  it("compute the next month, the last day and a label", () => {
    expect(nextCreditMonth("2026-12-01")).toBe("2027-01-01");
    expect(creditMonthEnd("2028-02-01")).toBe("2028-02-29");
    expect(formatCreditMonth("2026-10-01", ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])).toBe(
      "Oct 2026",
    );
  });
});
