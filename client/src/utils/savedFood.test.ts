import { formatSavedFood } from "./savedFood.js";

describe("formatSavedFood", () => {
  it("lists only non-zero totals, with one decimal for fractions", () => {
    expect(formatSavedFood({ kg: 42.25, l: 0, pieces: 30 }, "kom")).toEqual(["42.3 kg", "30 kom"]);
    expect(formatSavedFood({ kg: 0, l: 12, pieces: 0 }, "pcs")).toEqual(["12 l"]);
  });

  it("returns an empty list when nothing was saved", () => {
    expect(formatSavedFood({ kg: 0, l: 0, pieces: 0 }, "kom")).toEqual([]);
  });
});
