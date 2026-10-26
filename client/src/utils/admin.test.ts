import { formatDateTime } from "./admin.js";

describe("formatDateTime", () => {
  it("shows dd/mm/yyyy and a 24-hour time", () => {
    expect(formatDateTime(new Date(2030, 2, 15, 14, 5).toISOString())).toBe("15/03/2030 14:05");
    expect(formatDateTime(new Date(2030, 2, 15, 0, 30).toISOString())).toBe("15/03/2030 00:30");
  });

  it("returns an empty text for an invalid timestamp", () => {
    expect(formatDateTime("not a date")).toBe("");
  });
});
