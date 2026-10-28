import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown } from "lucide-react";
import { FilterField } from "./FilterBar.js";
import { CountPill } from "./ProductPageHeader.js";
import { inputStyle } from "../form/FormField.js";

export interface SortOption<T extends string = string> {
  value: T;
  // i18n key of the label.
  label: string;
}

// The `GET /products` sorts on a store's profile (one store, so no distance). Prices are per
// unit, as the cards show.
export const STORE_PROFILE_SORT_OPTIONS = [
  { value: "newest", label: "filters.sortNewest" },
  { value: "expiry", label: "filters.sortExpiry" },
  { value: "price_asc", label: "filters.sortPriceAsc" },
  { value: "price_desc", label: "filters.sortPriceDesc" },
  { value: "discount_desc", label: "filters.sortDiscountDesc" },
  { value: "discount_asc", label: "filters.sortDiscountAsc" },
] as const satisfies readonly SortOption[];

export type StoreProfileSort = (typeof STORE_PROFILE_SORT_OPTIONS)[number]["value"];

// The marketplace: nearest store first (the default), then the store profile's sorts.
export const MARKETPLACE_SORT_OPTIONS = [
  { value: "distance", label: "filters.sortNearest" },
  ...STORE_PROFILE_SORT_OPTIONS,
] as const satisfies readonly SortOption[];

export type MarketplaceSort = (typeof MARKETPLACE_SORT_OPTIONS)[number]["value"];

// The `GET /reservations/mine` sorts offered on the restaurant's Active reservations.
export const MY_RESERVATIONS_SORT_OPTIONS = [
  { value: "newest", label: "filters.sortNewest" },
  { value: "status", label: "reservations.sortPendingFirst" },
  { value: "pickup", label: "reservations.sortPickupSoonest" },
] as const satisfies readonly SortOption[];

export type MyReservationsSort = (typeof MY_RESERVATIONS_SORT_OPTIONS)[number]["value"];

interface SortSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SortOption<T>[];
}

// A "Sort by" select; its label names it for screen readers and tests.
function SortSelect<T extends string>({ value, onChange, options }: SortSelectProps<T>) {
  const { t } = useTranslation();

  return (
    <label className="flex items-center gap-2 text-sm text-gray-500">
      <span className="shrink-0">{t("filters.sortBy")}</span>
      <FilterField icon={ArrowUpDown}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={`${inputStyle} sm:w-56`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </FilterField>
    </label>
  );
}

interface ResultsBarProps {
  count: string;
  children: ReactNode;
}

// The row above a product grid: the count on the left, controls (the sort) on the right;
// stacked on phones.
export function ResultsBar({ count, children }: ResultsBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <CountPill>{count}</CountPill>
      {children}
    </div>
  );
}

export default SortSelect;
