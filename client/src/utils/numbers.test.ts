import { formatNumber } from "./numbers.js";

describe("formatNumber", () => {
  it("formats with the interface language's separators", () => {
    expect(formatNumber(1246.5, "bs", 2)).toBe("1.246,50");
    expect(formatNumber(873.94, "bs", 1)).toBe("873,9");
    expect(formatNumber(1246.5, "en", 2)).toBe("1,246.50");
    expect(formatNumber(873.94, "en", 1)).toBe("873.9");
  });

  it("drops trailing decimals down to minDigits", () => {
    expect(formatNumber(24, "bs", 1, 0)).toBe("24");
    expect(formatNumber(0.8, "bs", 1, 0)).toBe("0,8");
    expect(formatNumber(1200, "bs", 1, 0)).toBe("1.200");
  });
});
