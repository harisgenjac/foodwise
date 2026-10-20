import { formatSavedFood, getSavedFoodTotals } from "./savedFood.js";
import { makeReservation } from "../test/utils.js";
import type { Reservation } from "../types/index.js";

const reservation = (quantity: string, unit: string, status: Reservation["status"] = "Confirmed") =>
  makeReservation({ quantity, unit, status });

describe("getSavedFoodTotals", () => {
  it("normalises weight to kg, volume to l and counts kom and pak as pieces", () => {
    const totals = getSavedFoodTotals([
      reservation("2", "kg"),
      reservation("500", "g"),
      reservation("1.5", "l"),
      reservation("250", "ml"),
      reservation("3", "kom"),
      reservation("2", "pak", "Completed"),
    ]);
    expect(totals).toEqual({ kg: 2.5, l: 1.75, pieces: 5 });
  });

  it("ignores Pending and Cancelled reservations and unknown units", () => {
    const totals = getSavedFoodTotals([
      reservation("5", "kg", "Pending"),
      reservation("5", "kg", "Cancelled"),
      reservation("5", "box"),
    ]);
    expect(totals).toEqual({ kg: 0, l: 0, pieces: 0 });
  });
});

describe("formatSavedFood", () => {
  it("lists only non-zero totals, with one decimal for fractions", () => {
    expect(formatSavedFood({ kg: 42.25, l: 0, pieces: 30 }, "kom")).toEqual(["42.3 kg", "30 kom"]);
    expect(formatSavedFood({ kg: 0, l: 12, pieces: 0 }, "pcs")).toEqual(["12 l"]);
  });

  it("returns an empty list when nothing was saved", () => {
    expect(formatSavedFood({ kg: 0, l: 0, pieces: 0 }, "kom")).toEqual([]);
  });
});
