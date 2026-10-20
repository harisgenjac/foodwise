import { Package } from "lucide-react";
import { CATEGORY_ICONS, getCategoryIcon } from "./categoryIcons.js";
import { CATEGORY_IMAGES } from "./categoryImages.js";
import { CATEGORY_LABELS } from "./categories.js";
import { UNIT_LABELS } from "./units.js";
import { PRODUCT_STATUS_STYLES } from "./productStatus.js";
import { RESERVATION_STATUS_STYLES } from "./reservationStatus.js";
import bs from "../i18n/locales/bs.json";
import en from "../i18n/locales/en.json";

// The category and unit keys are stored on products, so every lookup table must know all of them.
const CATEGORIES = Object.keys(bs.categories);
const UNITS = Object.keys(bs.units);

describe("category lookups", () => {
  it.each(CATEGORIES)("has an icon, an image and a label for %s", (category) => {
    expect(CATEGORY_ICONS[category]).toBeDefined();
    expect(CATEGORY_IMAGES[category]).toMatch(/^https:\/\//);
    expect(CATEGORY_LABELS[category]).toBeDefined();
  });

  it("uses the same category keys in both languages", () => {
    expect(Object.keys(en.categories).sort()).toEqual([...CATEGORIES].sort());
  });

  it("falls back to the package icon for an unknown category", () => {
    expect(getCategoryIcon("Unknown")).toBe(Package);
    expect(getCategoryIcon("Meat")).toBe(CATEGORY_ICONS.Meat);
  });
});

describe("unit lookups", () => {
  it("knows every unit in both languages", () => {
    expect(Object.keys(UNIT_LABELS).sort()).toEqual([...UNITS].sort());
    expect(Object.keys(en.units).sort()).toEqual([...UNITS].sort());
  });
});

describe("status styles", () => {
  it("styles every product and reservation status", () => {
    expect(Object.keys(PRODUCT_STATUS_STYLES).sort()).toEqual(["Available", "Expired", "Removed", "Reserved", "Sold"]);
    expect(Object.keys(RESERVATION_STATUS_STYLES).sort()).toEqual(["Cancelled", "Completed", "Confirmed", "Pending"]);
  });

  it("translates every reservation status", () => {
    for (const status of Object.keys(RESERVATION_STATUS_STYLES)) {
      expect(bs.reservationStatus).toHaveProperty(status);
      expect(en.reservationStatus).toHaveProperty(status);
    }
  });
});
