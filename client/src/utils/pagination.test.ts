import { pageItems } from "./pagination.js";

describe("pageItems", () => {
  it("lists every page when there are at most 7", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("puts an ellipsis on both sides of a page in the middle", () => {
    expect(pageItems(10, 20)).toEqual([1, "ellipsis", 9, 10, 11, "ellipsis", 20]);
  });

  it("shows the first five pages near the start and the last five near the end", () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20]);
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20]);
    expect(pageItems(20, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20]);
    expect(pageItems(17, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20]);
  });

  it("never shows more than 7 items", () => {
    expect(pageItems(5, 9)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 9]);
    for (let current = 1; current <= 30; current += 1) {
      expect(pageItems(current, 30).length).toBeLessThanOrEqual(7);
    }
  });
});
