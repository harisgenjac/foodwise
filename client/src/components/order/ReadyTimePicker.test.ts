import { readyAtOf } from "./ReadyTimePicker.js";

// Local 10:15 on Nov 16, 2026.
const NOW = new Date(2026, 10, 16, 10, 15);

describe("readyAtOf", () => {
  it("adds the minutes, or takes an exact time later today", () => {
    expect(readyAtOf({ kind: "minutes", minutes: 30 }, NOW)).toBe(new Date(2026, 10, 16, 10, 45).toISOString());
    expect(readyAtOf({ kind: "exact", time: "14:30" }, NOW)).toBe(new Date(2026, 10, 16, 14, 30).toISOString());
    expect(readyAtOf({ kind: "exact", time: "1430" }, NOW)).toBe(new Date(2026, 10, 16, 14, 30).toISOString());
  });

  it("has no time for an unfinished or passed exact time", () => {
    expect(readyAtOf({ kind: "exact", time: "" }, NOW)).toBeNull();
    expect(readyAtOf({ kind: "exact", time: "9:" }, NOW)).toBeNull();
    expect(readyAtOf({ kind: "exact", time: "09:00" }, NOW)).toBeNull();
  });
});
