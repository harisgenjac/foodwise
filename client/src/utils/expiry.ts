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

// YYYY-MM-DD as dd/mm/yyyy, the format dates are shown in on the reports page.
export function formatDisplayDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}

// dd/mm/yyyy (also d/m/yyyy, with "/", "." or "-") as YYYY-MM-DD, or null for anything
// that is not a real date (31/02/2026).
export function parseDisplayDate(text: string): string | null {
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match.map(Number) as [number, number, number, number];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return toDateInput(date);
}
