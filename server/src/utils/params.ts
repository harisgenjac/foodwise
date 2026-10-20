const MAX_INTEGER = 2147483647;

// A positive integer id (route param or body field), or null when it cannot be a valid id.
export const parseId = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 && value <= MAX_INTEGER ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id > 0 && id <= MAX_INTEGER ? id : null;
};

// A finite number from a body field or query string, or null.
export const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// A non-negative integer from a query string, or null.
export const parseNonNegativeInt = (value: unknown): number | null => {
  const number = parseNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 && number <= MAX_INTEGER
    ? number
    : null;
};
