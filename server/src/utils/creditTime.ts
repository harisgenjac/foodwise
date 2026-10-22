// Credit days and months change at 00:00 in Europe/London (01:00 in Sarajevo, in winter and summer
// alike), so by then the day has changed everywhere in Europe. This is separate from APP_TIMEZONE,
// which keeps driving expiry dates and pickups. Intl handles the DST switches.
export const CREDIT_TIMEZONE = "Europe/London";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: CREDIT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The credit day of an instant as YYYY-MM-DD.
export const creditDay = (instant: Date): string => dayFormat.format(instant);

// The credit month of an instant as its first day, YYYY-MM-01 (the period_month columns).
export const creditMonth = (instant: Date): string => `${creditDay(instant).slice(0, 7)}-01`;

const parseMonth = (periodMonth: string) => ({
  year: Number(periodMonth.slice(0, 4)),
  month: Number(periodMonth.slice(5, 7)),
});

const pad = (value: number) => String(value).padStart(2, "0");

// The month after a YYYY-MM-01 period, as YYYY-MM-01.
export const nextMonth = (periodMonth: string): string => {
  const { year, month } = parseMonth(periodMonth);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
};

// The last day of a YYYY-MM-01 period, as YYYY-MM-DD.
export const monthEnd = (periodMonth: string): string => {
  const { year, month } = parseMonth(periodMonth);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(lastDay)}`;
};
