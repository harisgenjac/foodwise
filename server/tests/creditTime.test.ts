import { creditDay, creditMonth, monthEnd, nextMonth } from "../src/utils/creditTime.js";
import { isRefundEligible } from "../src/services/creditService.js";

// The credit day changes at 00:00 Europe/London = 01:00 in Sarajevo, winter and summer alike.
// Times below are Sarajevo wall-clock times with their UTC offset.
describe("credit day boundary (Europe/London)", () => {
  it.each([
    ["winter (CET / GMT)", "2026-01-15T00:59:00+01:00", "2026-01-15T01:01:00+01:00", "2026-01-14", "2026-01-15"],
    ["summer (CEST / BST)", "2026-07-15T00:59:00+02:00", "2026-07-15T01:01:00+02:00", "2026-07-14", "2026-07-15"],
    // Europe switches to summer time on 2026-03-29 at 01:00 UTC, after these instants.
    ["the night of the spring switch", "2026-03-29T00:59:00+01:00", "2026-03-29T01:01:00+01:00", "2026-03-28", "2026-03-29"],
    ["the first night after the spring switch", "2026-03-30T00:59:00+02:00", "2026-03-30T01:01:00+02:00", "2026-03-29", "2026-03-30"],
    // And back to winter time on 2026-10-25 at 01:00 UTC.
    ["the night of the autumn switch", "2026-10-25T00:59:00+02:00", "2026-10-25T01:01:00+02:00", "2026-10-24", "2026-10-25"],
    ["the first night after the autumn switch", "2026-10-26T00:59:00+01:00", "2026-10-26T01:01:00+01:00", "2026-10-25", "2026-10-26"],
  ])("%s: 00:59 Sarajevo is still the old day, 01:01 the new one", (_, before, after, oldDay, newDay) => {
    expect(creditDay(new Date(before))).toBe(oldDay);
    expect(creditDay(new Date(after))).toBe(newDay);
  });

  it.each([
    ["winter", "2026-01-14T10:00:00+01:00", "2026-01-15T00:59:00+01:00", "2026-01-15T01:01:00+01:00"],
    ["summer", "2026-07-14T10:00:00+02:00", "2026-07-15T00:59:00+02:00", "2026-07-15T01:01:00+02:00"],
    ["spring switch", "2026-03-28T10:00:00+01:00", "2026-03-29T00:59:00+01:00", "2026-03-29T01:01:00+01:00"],
    ["autumn switch", "2026-10-24T10:00:00+02:00", "2026-10-25T00:59:00+02:00", "2026-10-25T01:01:00+02:00"],
  ])("same-day refund (%s): allowed at 00:59 Sarajevo, not at 01:01", (_, chargedAt, before, after) => {
    expect(isRefundEligible(new Date(chargedAt), new Date(before))).toBe(true);
    expect(isRefundEligible(new Date(chargedAt), new Date(after))).toBe(false);
  });

  it("starts the credit month at 00:00 London on the 1st (01:00 Sarajevo)", () => {
    expect(creditMonth(new Date("2026-11-01T00:30:00+01:00"))).toBe("2026-10-01");
    expect(creditMonth(new Date("2026-11-01T01:30:00+01:00"))).toBe("2026-11-01");
    expect(creditMonth(new Date("2026-08-01T00:59:00+02:00"))).toBe("2026-07-01");
    expect(creditMonth(new Date("2026-08-01T01:01:00+02:00"))).toBe("2026-08-01");
  });

  it("computes the next month and the last day of a month", () => {
    expect(nextMonth("2026-12-01")).toBe("2027-01-01");
    expect(nextMonth("2026-01-01")).toBe("2026-02-01");
    expect(monthEnd("2028-02-01")).toBe("2028-02-29");
    expect(monthEnd("2026-02-01")).toBe("2026-02-28");
    expect(monthEnd("2026-12-01")).toBe("2026-12-31");
  });
});
