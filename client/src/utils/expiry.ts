import type { Product } from '../types/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Prefers the server-computed value; falls back to the expiry date for endpoints that do not return it.
export function getDaysUntilExpiry(product: Product): number {
  if (typeof product.days_until_expiry === 'number') {
    return product.days_until_expiry;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(product.expiry_date);
  expiry.setHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - today.getTime()) / DAY_MS);
}

// Local YYYY-MM-DD (toISOString would shift the date across midnight in UTC+ time zones).
export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

// Whole days from today to a YYYY-MM-DD date, compared at local midnight.
export function daysFromToday(dateInput: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateInput}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}
