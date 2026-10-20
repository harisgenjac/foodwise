import { toDateInput } from "./expiry.js";

export type Preset = "thisMonth" | "lastMonth" | "last3Months" | "thisYear" | "custom";

export const PRESETS: Exclude<Preset, "custom">[] = ["thisMonth", "lastMonth", "last3Months", "thisYear"];

// Local YYYY-MM-DD periods for the reports page. They end today, except last month,
// which is the whole previous calendar month.
export function presetPeriod(preset: Exclude<Preset, "custom">, today = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth();
  switch (preset) {
    case "thisMonth":
      return { from: toDateInput(new Date(year, month, 1)), to: toDateInput(today) };
    case "lastMonth":
      return { from: toDateInput(new Date(year, month - 1, 1)), to: toDateInput(new Date(year, month, 0)) };
    case "last3Months":
      return { from: toDateInput(new Date(year, month - 2, 1)), to: toDateInput(today) };
    case "thisYear":
      return { from: toDateInput(new Date(year, 0, 1)), to: toDateInput(today) };
  }
}
