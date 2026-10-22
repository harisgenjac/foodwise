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
    return "All fields are required.";
  }
  if (typeof name !== "string" || name.trim() === "") {
    return "All fields are required.";
  }
  if (!CATEGORIES.includes(category)) {
    return "Category is not valid.";
  }
  if (!UNITS.includes(unit)) {
    return "Unit of measure is not valid.";
  }

  const original = parseNumber(original_price);
  const discounted = parseNumber(discounted_price);
  if (original === null || discounted === null || original <= 0 || discounted <= 0) {
    return "Prices and quantity must be positive numbers.";
  }
  if (discounted > original) {
    return "Discounted price cannot be higher than the original price.";
  }

  const amount = parseNumber(quantity);
  if (amount === null || amount <= 0) {
    return "Prices and quantity must be positive numbers.";
  }

  if (!isValidDate(expiry_date)) {
    return "Expiry date is not valid.";
  }
  // Both are YYYY-MM-DD, so string order is date order.
  if (expiry_date < todayInAppTimezone()) {
    return "Expiry date cannot be in the past.";
  }

  return null;
}

// Templates only require name, category and unit; the numbers are optional but must make sense when given.
export function validateTemplateFields(fields: Record<string, unknown> | undefined) {
  const { name, category, unit, original_price, discounted_price, quantity, shelf_life_days } =
    fields ?? {};

  if (!name || !category || !unit || typeof name !== "string" || name.trim() === "") {
    return "Name, category and unit of measure are required.";
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category)) {
    return "Category is not valid.";
  }
  if (typeof unit !== "string" || !UNITS.includes(unit)) {
    return "Unit of measure is not valid.";
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
    return "Prices and quantity must be numbers greater than zero.";
  }
  if (
    !isEmpty(original_price) &&
    !isEmpty(discounted_price) &&
    parseNumber(discounted_price)! > parseNumber(original_price)!
  ) {
    return "Discounted price cannot be higher than the original price.";
  }
  if (!isEmpty(shelf_life_days)) {
    const days = parseNumber(shelf_life_days);
    if (days === null || !Number.isInteger(days) || days < 0) {
      return "Shelf life in days must be a whole number.";
    }
  }

  return null;
}
