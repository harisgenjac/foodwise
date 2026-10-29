// Business days follow Europe/Sarajevo (the server's APP_TIMEZONE), not the machine's time zone.
const TIME_ZONE = "Europe/Sarajevo";

// Today plus `days` in Sarajevo as [yyyy, mm, dd].
const sarajevoDay = (days: number): [string, string, string] => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${parts}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const [year, month, day] = date.toISOString().slice(0, 10).split("-");
  return [year!, month!, day!];
};

// Today plus `days` in Sarajevo, as dd/mm/yyyy (the format of the app's DateInput).
export const sarajevoDate = (days = 0): string => {
  const [year, month, day] = sarajevoDay(days);
  return `${day}/${month}/${year}`;
};

// Today plus `days` in Sarajevo, as yyyy-mm-dd (the format the API takes).
export const isoDate = (days = 0): string => sarajevoDay(days).join("-");
