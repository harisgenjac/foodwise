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

// dd/mm/yyyy (also d/m/yyyy, with "/", "." or "-", or eight bare digits ddmmyyyy) as YYYY-MM-DD,
// or null for anything that is not a real date (31/02/2026).
export function parseDisplayDate(text: string): string | null {
  const value = text.trim();
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match.map(Number) as [number, number, number, number];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return toDateInput(date);
}

// The text of a date field while it is typed in. A phone's number pad has no "/", so digits are
// shown as dd/mm/yyyy (at most eight), with the slash added after the day and the month ("05" is
// "05/", "0511" is "05/11/"). A one-digit day or month closed with a slash gets its zero ("5/" is
// "05/"). "." and "-" count as slashes ("5.11.2026" is "05/11/2026"). While deleting (`next` shorter
// than `previous`) no slash is added back, so it can be removed. Text with any other character is
// left as typed, for parseDisplayDate to reject.
export function formatDateTyping(next: string, previous: string): string {
  if (/[^\d/.-]/.test(next)) return next;
  const deleting = next.length < previous.length;
  const segments = next.replace(/[.-]/g, '/').split('/');
  const digits = segments
    .map((segment, index) => (index < 2 && index < segments.length - 1 && segment.length === 1 ? `0${segment}` : segment))
    .join('')
    .slice(0, 8);
  const slashAfter = (length: number) => digits.length > length || (digits.length === length && !deleting);
  let shown = digits.slice(0, 2);
  if (slashAfter(2)) shown += `/${digits.slice(2, 4)}`;
  if (slashAfter(4)) shown += `/${digits.slice(4)}`;
  return shown;
}

// A typed 24-hour time as HH:MM, or null for anything outside 00:00–23:59. Accepts "14:30", "14.30",
// "1430", "930", "9:05" and a bare hour ("9" and "9:" are 09:00).
export function parseTimeInput(text: string): string | null {
  const value = text.trim();
  const match = /^(\d{1,2})(?:[:.](\d{2})?)?$/.exec(value) ?? /^(\d{1,2})(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// The text of a time field while it is typed in: up to four digits shown as HH:MM, with the colon
// added after the hour ("14" is "14:", "1430" is "14:30"). An hour that can only have one digit gets
// its zero ("9", "930" and "1:" are "09:", "09:30" and "01:"). While deleting (`next` shorter than
// `previous`) nothing is added back, so the colon and the zero can be removed. An hour above 23 becomes
// 23 and minutes starting with 6-9 become 59, so no time out of range can be typed ("2999" is "23:59").
export function formatTimeTyping(next: string, previous: string): string {
  let digits = next.replace(/\D/g, '');
  const deleting = next.length < previous.length;
  if (!deleting && (/^[3-9]/.test(digits) || (digits.length === 1 && /^\d[:.]/.test(next.trim())))) {
    digits = `0${digits}`;
  }
  digits = digits.slice(0, 4);
  if (digits.length >= 2 && Number(digits.slice(0, 2)) > 23) digits = `23${digits.slice(2)}`;
  if (digits.length >= 3 && Number(digits[2]) > 5) digits = `${digits.slice(0, 2)}59`;
  if (digits.length < 2 || (digits.length === 2 && deleting)) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
