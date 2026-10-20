import { isValidDate, todayInAppTimezone } from "./dates.js";
import { parseNumber } from "./params.js";

// Keep in sync with client/src/utils/categories.ts and units.ts.
export const CATEGORIES = [
  "Meat",
  "Fish",
  "Dairy",
  "Vegetables",
  "Fruits",
  "Bakery",
  "Drinks",
  "Frozen Food",
  "Other",
];
export const UNITS = ["kg", "g", "l", "ml", "kom", "pak"];

export interface ProductFields {
  name: string;
  description?: string;
  category: string;
  original_price: string;
  discounted_price: string;
  quantity: string;
  unit: string;
  expiry_date: string;
}

export function validateProductFields(fields: Partial<ProductFields> | undefined) {
  const { name, category, original_price, discounted_price, quantity, unit, expiry_date } =
    fields ?? ({} as Partial<ProductFields>);

  if (!name || !category || !original_price || !discounted_price || !quantity || !unit || !expiry_date) {
    return "Sva polja su obavezna.";
  }
  if (typeof name !== "string" || name.trim() === "") {
    return "Sva polja su obavezna.";
  }
  if (!CATEGORIES.includes(category)) {
    return "Kategorija nije ispravna.";
  }
  if (!UNITS.includes(unit)) {
    return "Jedinica mjere nije ispravna.";
  }

  const original = parseNumber(original_price);
  const discounted = parseNumber(discounted_price);
  if (original === null || discounted === null || original <= 0 || discounted <= 0) {
    return "Cijene i količina moraju biti pozitivni brojevi.";
  }
  if (discounted > original) {
    return "Snižena cijena ne može biti veća od originalne.";
  }

  const amount = parseNumber(quantity);
  if (amount === null || amount <= 0) {
    return "Cijene i količina moraju biti pozitivni brojevi.";
  }

  if (!isValidDate(expiry_date)) {
    return "Datum isteka nije ispravan.";
  }
  // Both are YYYY-MM-DD, so string order is date order.
  if (expiry_date < todayInAppTimezone()) {
    return "Datum isteka ne može biti u prošlosti.";
  }

  return null;
}

// Templates only require name, category and unit; the numbers are optional but must make sense when given.
export function validateTemplateFields(fields: Record<string, unknown> | undefined) {
  const { name, category, unit, original_price, discounted_price, quantity, shelf_life_days } =
    fields ?? {};

  if (!name || !category || !unit || typeof name !== "string" || name.trim() === "") {
    return "Naziv, kategorija i jedinica mjere su obavezni.";
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category)) {
    return "Kategorija nije ispravna.";
  }
  if (typeof unit !== "string" || !UNITS.includes(unit)) {
    return "Jedinica mjere nije ispravna.";
  }

  const isEmpty = (value: unknown) => value === undefined || value === null || value === "";
  const isPositive = (value: unknown) => {
    const number = parseNumber(value);
    return number !== null && number > 0;
  };
  if (
    (!isEmpty(original_price) && !isPositive(original_price)) ||
    (!isEmpty(discounted_price) && !isPositive(discounted_price)) ||
    (!isEmpty(quantity) && !isPositive(quantity))
  ) {
    return "Cijene i količina moraju biti brojevi veći od nule.";
  }
  if (
    !isEmpty(original_price) &&
    !isEmpty(discounted_price) &&
    parseNumber(discounted_price)! > parseNumber(original_price)!
  ) {
    return "Snižena cijena ne može biti veća od originalne.";
  }
  if (!isEmpty(shelf_life_days)) {
    const days = parseNumber(shelf_life_days);
    if (days === null || !Number.isInteger(days) || days < 0) {
      return "Rok trajanja u danima mora biti cijeli broj.";
    }
  }

  return null;
}
