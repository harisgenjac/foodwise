import { isValidDate, todayInAppTimezone } from "./dates.js";
import { parseNumber } from "./params.js";
import { CATEGORIES, UNITS } from "./validateProduct.js";

// Keep in sync with client/src/utils/donations.ts.
export const DONATION_TYPES = ["FREE", "SPONSORED"];
export const DONATION_STATUSES = ["Available", "Expired", "Removed"];
// Donations add ready meals and portions to the product categories and units.
export const MEAL_CATEGORY = "Meals";
export const DONATION_CATEGORIES = [...CATEGORIES, MEAL_CATEGORY];
export const DONATION_UNITS = [...UNITS, "portion"];
// The 14 allergens food businesses must declare under EU rules.
export const ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
];
export const SERVING_TEMPERATURES = ["HOT", "COLD", "FROZEN"];

export interface DonationFields {
  donation_type: string;
  name: string;
  description?: string | null;
  category: string;
  quantity: string | number;
  unit: string;
  original_price: string | number;
  donation_price?: string | number | null;
  expiry_date: string;
  pickup_from?: string | null;
  pickup_until?: string | null;
  allergens?: unknown;
  serving_temperature?: string | null;
}

// The values written to the database: FREE offers carry no price, and meal details are kept
// only for meals. Call it only after validateDonationFields returned null.
export interface NormalizedDonation {
  donation_type: string;
  name: string;
  description: string | null;
  category: string;
  quantity: number;
  unit: string;
  original_price: number;
  donation_price: number | null;
  expiry_date: string;
  pickup_from: string | null;
  pickup_until: string | null;
  allergens: string[];
  serving_temperature: string | null;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const isEmpty = (value: unknown) => value === undefined || value === null || value === "";

// A donor's price check, shared by the create form and "move a product to donations".
export function validateDonationPrice(
  donationType: unknown,
  donationPrice: unknown,
  originalPrice: unknown,
) {
  if (typeof donationType !== "string" || !DONATION_TYPES.includes(donationType)) {
    return "Vrsta donacije nije ispravna.";
  }
  if (donationType !== "SPONSORED") return null;
  const price = parseNumber(donationPrice);
  if (price === null || price <= 0) {
    return "Donacijska cijena je obavezna i mora biti veća od nule.";
  }
  const original = parseNumber(originalPrice);
  if (original !== null && price >= original) {
    return "Donacijska cijena mora biti manja od vrijednosti proizvoda.";
  }
  return null;
}

export function validateDonationFields(fields: Partial<DonationFields> | undefined) {
  const {
    donation_type,
    name,
    category,
    quantity,
    unit,
    original_price,
    donation_price,
    expiry_date,
    pickup_from,
    pickup_until,
    allergens,
    serving_temperature,
  } = fields ?? ({} as Partial<DonationFields>);

  if (
    !donation_type ||
    !name ||
    !category ||
    isEmpty(quantity) ||
    !unit ||
    isEmpty(original_price) ||
    !expiry_date
  ) {
    return "Sva polja su obavezna.";
  }
  if (typeof name !== "string" || name.trim() === "") {
    return "Sva polja su obavezna.";
  }
  if (!DONATION_CATEGORIES.includes(category)) {
    return "Kategorija nije ispravna.";
  }
  if (!DONATION_UNITS.includes(unit)) {
    return "Jedinica mjere nije ispravna.";
  }

  const amount = parseNumber(quantity);
  const value = parseNumber(original_price);
  if (amount === null || value === null || amount <= 0 || value <= 0) {
    return "Količina i vrijednost moraju biti pozitivni brojevi.";
  }

  const priceError = validateDonationPrice(donation_type, donation_price, original_price);
  if (priceError) return priceError;

  if (!isValidDate(expiry_date)) {
    return "Datum isteka nije ispravan.";
  }
  if (expiry_date < todayInAppTimezone()) {
    return "Datum isteka ne može biti u prošlosti.";
  }

  if (
    (!isEmpty(pickup_from) && (typeof pickup_from !== "string" || !TIME_PATTERN.test(pickup_from))) ||
    (!isEmpty(pickup_until) && (typeof pickup_until !== "string" || !TIME_PATTERN.test(pickup_until)))
  ) {
    return "Vrijeme preuzimanja nije ispravno.";
  }
  // HH:MM strings compare in time order.
  if (pickup_from && pickup_until && pickup_from.slice(0, 5) >= pickup_until.slice(0, 5)) {
    return "Početak preuzimanja mora biti prije kraja.";
  }

  if (
    allergens !== undefined &&
    allergens !== null &&
    (!Array.isArray(allergens) ||
      allergens.some((allergen) => typeof allergen !== "string" || !ALLERGENS.includes(allergen)))
  ) {
    return "Alergeni nisu ispravni.";
  }
  if (!isEmpty(serving_temperature) && !SERVING_TEMPERATURES.includes(serving_temperature as string)) {
    return "Način serviranja nije ispravan.";
  }

  return null;
}

export function normalizeDonationFields(fields: DonationFields): NormalizedDonation {
  const isMeal = fields.category === MEAL_CATEGORY;
  const allergens = Array.isArray(fields.allergens) ? (fields.allergens as string[]) : [];
  return {
    donation_type: fields.donation_type,
    name: fields.name.trim(),
    description:
      typeof fields.description === "string" && fields.description.trim() !== ""
        ? fields.description.trim()
        : null,
    category: fields.category,
    quantity: parseNumber(fields.quantity)!,
    unit: fields.unit,
    original_price: parseNumber(fields.original_price)!,
    donation_price:
      fields.donation_type === "SPONSORED" ? parseNumber(fields.donation_price)! : null,
    expiry_date: fields.expiry_date,
    pickup_from: fields.pickup_from || null,
    pickup_until: fields.pickup_until || null,
    allergens: isMeal ? [...new Set(allergens)] : [],
    serving_temperature: isMeal && fields.serving_temperature ? fields.serving_temperature : null,
  };
}
