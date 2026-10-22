import type { Role } from "../types/auth.js";

// Reports are files the user opens outside the app, so they follow the UI language
// (the client sends it as `lang`) instead of the usual English-only server text.
export type ReportLanguage = "bs" | "en";

export const parseReportLanguage = (value: unknown): ReportLanguage => (value === "en" ? "en" : "bs");

const CATEGORY_LABELS: Record<ReportLanguage, Record<string, string>> = {
  bs: {
    Meat: "Meso",
    Fish: "Riba",
    Dairy: "Mliječni proizvodi",
    Vegetables: "Povrće",
    Fruits: "Voće",
    Bakery: "Pekarski proizvodi",
    Drinks: "Pića",
    "Frozen Food": "Smrznuta hrana",
    Other: "Ostalo",
  },
  en: {
    Meat: "Meat",
    Fish: "Fish",
    Dairy: "Dairy Products",
    Vegetables: "Vegetables",
    Fruits: "Fruits",
    Bakery: "Bakery Products",
    Drinks: "Drinks",
    "Frozen Food": "Frozen Food",
    Other: "Other",
  },
};

export const categoryLabel = (lang: ReportLanguage, category: string): string =>
  CATEGORY_LABELS[lang][category] ?? category;

export const totalLabel = (lang: ReportLanguage) => (lang === "en" ? "Total" : "Ukupno");

// The other party is the restaurant for a store and the store for a restaurant.
export const salesHeaders = (lang: ReportLanguage, role: Role): string[] =>
  lang === "en"
    ? [
        "Pickup date",
        "Reservation no.",
        "Product",
        "Category",
        role === "STORE" ? "Restaurant" : "Store",
        "City",
        "Quantity",
        "Unit",
        "Unit price (KM)",
        "Original price (KM)",
        "Total (KM)",
        "Savings (KM)",
      ]
    : [
        "Datum preuzimanja",
        "Broj rezervacije",
        "Proizvod",
        "Kategorija",
        role === "STORE" ? "Restoran" : "Prodavnica",
        "Grad",
        "Količina",
        "Jedinica",
        "Cijena po jedinici (KM)",
        "Originalna cijena (KM)",
        "Ukupno (KM)",
        "Ušteda (KM)",
      ];

export const impactHeaders = (lang: ReportLanguage, role: Role): string[] =>
  lang === "en"
    ? [
        "Month",
        "Pickups",
        role === "STORE" ? "Restaurants" : "Stores",
        "Food saved (kg)",
        "Food saved (l)",
        "Food saved (pcs)",
        "Value (KM)",
        "Savings (KM)",
      ]
    : [
        "Mjesec",
        "Broj preuzimanja",
        role === "STORE" ? "Broj restorana" : "Broj prodavnica",
        "Spašena hrana (kg)",
        "Spašena hrana (l)",
        "Spašena hrana (kom)",
        "Vrijednost (KM)",
        "Ušteda (KM)",
      ];
