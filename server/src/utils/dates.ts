// Business dates (expiry, pickup, cron runs) follow the market's local day, not the host's time zone.
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Europe/Sarajevo";

// Today's date as YYYY-MM-DD in APP_TIMEZONE.
export const todayInAppTimezone = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

// A real calendar date in YYYY-MM-DD form (rejects 2026-02-31).
export const isValidDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

// A date with an optional time, in a form PostgreSQL parses the same way as JavaScript.
export const isValidDateTime = (value: unknown): value is string =>
  typeof value === "string" &&
  DATE_TIME_PATTERN.test(value) &&
  isValidDate(value.slice(0, 10)) &&
  !Number.isNaN(new Date(value).getTime());
