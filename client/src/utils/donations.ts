import { UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CATEGORY_IMAGES } from "./categoryImages.js";
import { getCategoryIcon } from "./categoryIcons.js";
import { isBlank, REQUIRED, type FieldErrors } from "./validation.js";
import type { DonationFormValues, DonationOffer } from "../types/index.js";

// Keep in sync with server/src/utils/validateDonation.ts.
export const MEAL_CATEGORY = "Meals";
export const PORTION_UNIT = "portion";
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

const MEAL_IMAGE = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800";

export const getDonationImage = (category: string) =>
  category === MEAL_CATEGORY ? MEAL_IMAGE : CATEGORY_IMAGES[category] || CATEGORY_IMAGES.Other;

export const getDonationIcon = (category: string): LucideIcon =>
  category === MEAL_CATEGORY ? UtensilsCrossed : getCategoryIcon(category);

export const DONATION_STATUS_STYLES: Record<DonationOffer["status"], string> = {
  Available: "bg-green-50 text-green-700",
  Expired: "bg-red-50 text-red-600",
  Removed: "bg-gray-100 text-gray-500",
};

export const DONATION_TYPE_STYLES: Record<DonationOffer["donation_type"], string> = {
  FREE: "bg-green-600 text-white",
  SPONSORED: "bg-violet-600 text-white",
};

// "19:00:00" → "19:00"; the time input and the card show hours and minutes only.
export const shortTime = (time: string | null) => (time ? time.slice(0, 5) : "");

// Share of the value the donor gives away on a sponsored donation, or null when the prices don't allow it.
export const donationDiscountPercent = (originalPrice: string, donationPrice: string) => {
  const original = Number(originalPrice);
  const price = Number(donationPrice);
  if (!(original > 0) || !(price > 0) || price >= original) return null;
  return Math.round((1 - price / original) * 100);
};

export const EMPTY_DONATION_FORM: DonationFormValues = {
  donation_type: "FREE",
  name: "",
  description: "",
  category: "",
  quantity: "",
  unit: "",
  original_price: "",
  donation_price: "",
  expiry_date: "",
  pickup_from: "",
  pickup_until: "",
  allergens: [],
  serving_temperature: "",
};

export const donationToForm = (donation: DonationOffer): DonationFormValues => ({
  donation_type: donation.donation_type,
  name: donation.name,
  description: donation.description ?? "",
  category: donation.category,
  quantity: donation.quantity,
  unit: donation.unit,
  original_price: donation.original_price,
  donation_price: donation.donation_price ?? "",
  expiry_date: donation.expiry_date.slice(0, 10),
  pickup_from: shortTime(donation.pickup_from),
  pickup_until: shortTime(donation.pickup_until),
  allergens: donation.allergens,
  serving_temperature: donation.serving_temperature ?? "",
});

export type DonationField = keyof DonationFormValues;

const REQUIRED_DONATION_FIELDS = ["name", "category", "quantity", "unit", "original_price", "expiry_date"] as const;

// The client-side checks before a request: an i18n key per invalid field. A paid donation also
// needs a price below the value; the pickup window is optional but must end after it starts.
export const validateDonationForm = (form: DonationFormValues): FieldErrors<DonationField> => {
  const errors: FieldErrors<DonationField> = {};
  for (const field of REQUIRED_DONATION_FIELDS) {
    if (isBlank(form[field])) errors[field] = REQUIRED;
  }
  if (form.donation_type === "SPONSORED") {
    if (isBlank(form.donation_price)) {
      errors.donation_price = REQUIRED;
    } else if (!errors.original_price && donationDiscountPercent(form.original_price, form.donation_price) === null) {
      errors.donation_price = "donations.form.priceInvalid";
    }
  }
  if (form.pickup_from && form.pickup_until && form.pickup_from >= form.pickup_until) {
    errors.pickup_until = "donations.form.invalidPickup";
  }
  return errors;
};

// Request body: FREE donations carry no price and only meals carry meal details.
export const donationFormToPayload = (form: DonationFormValues) => {
  const isMeal = form.category === MEAL_CATEGORY;
  return {
    ...form,
    donation_price: form.donation_type === "SPONSORED" ? form.donation_price : null,
    pickup_from: form.pickup_from || null,
    pickup_until: form.pickup_until || null,
    allergens: isMeal ? form.allergens : [],
    serving_temperature: isMeal && form.serving_temperature ? form.serving_temperature : null,
  };
};
