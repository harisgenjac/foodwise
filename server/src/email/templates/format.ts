import type { EmailLanguage } from "./layout.js";

// Short unit labels, as the app shows them next to a quantity.
const UNIT_LABELS: Record<EmailLanguage, Record<string, string>> = {
  bs: { kg: "kg", g: "g", l: "l", ml: "ml", kom: "kom", pak: "pak" },
  en: { kg: "kg", g: "g", l: "l", ml: "ml", kom: "pcs", pak: "pk" },
};

export const unitLabel = (unit: string, lang: EmailLanguage) => UNIT_LABELS[lang][unit] ?? unit;

// "4.00" → "4", "2.50" → "2,5" in Bosnian and "2.5" in English.
export const formatQuantity = (quantity: string, lang: EmailLanguage) => {
  const value = Number(quantity);
  if (!Number.isFinite(value)) return quantity;
  return new Intl.NumberFormat(lang === "en" ? "en-US" : "bs-BA", { maximumFractionDigits: 2 }).format(value);
};

// "2026-11-06T14:30" (local wall-clock time) → "06.11.2026. 14:30" / "06/11/2026 14:30", the date
// formats the app uses. Midnight means only a day was chosen, so the time is left out.
export const formatPickup = (pickupAt: string, lang: EmailLanguage) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(pickupAt);
  if (!match) return pickupAt;
  const [, year, month, day, hour, minute] = match;
  const date = lang === "en" ? `${day}/${month}/${year}` : `${day}.${month}.${year}.`;
  return hour === undefined || (hour === "00" && minute === "00") ? date : `${date} ${hour}:${minute}`;
};
