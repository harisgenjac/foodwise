import { parse } from "csv-parse/sync";
import { validateProductFields, type ProductFields } from "./validateProduct.js";

export const CSV_COLUMNS = [
  "name",
  "description",
  "category",
  "original_price",
  "discounted_price",
  "quantity",
  "unit",
  "expiry_date",
] as const;
const REQUIRED_COLUMNS = CSV_COLUMNS.filter((column) => column !== "description");
export const MAX_CSV_ROWS = 500;

export interface CsvRowError {
  row: number;
  error: string;
}

export type CsvParseResult =
  | { error: string; rowErrors?: CsvRowError[] }
  | { error?: undefined; products: ProductFields[] };

// Excel with Bosnian regional settings saves CSV with ";" and a decimal comma, so the
// delimiter is read from the header line instead of accepting both everywhere.
const detectDelimiter = (text: string) => {
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  return header.split(";").length > header.split(",").length ? ";" : ",";
};

// "2,50" → "2.50"; anything that is not a plain number is left for the validator to reject.
const normalizeNumber = (value: string | undefined) =>
  value && /^\d+,\d+$/.test(value) ? value.replace(",", ".") : value;

const YEAR_FIRST = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/;
const DAY_FIRST = /^(\d{1,2})[.-](\d{1,2})[.-](\d{4}|\d{2})$/;
const SLASHED = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/;
const EXCEL_SERIAL = /^\d{5}$/;
// Excel counts days from 1899-12-30 (its 1900 leap-year bug included).
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

// Excel rewrites dates in the regional format when it saves a CSV: "31. 12. 2026.", "31.12.26",
// "12/31/2026", "2026-12-31 00:00:00" or, for a cell formatted as a number, a serial like 46387.
const cleanDate = (value: string) =>
  value
    .replace(/T.*$/, "")
    .replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?$/i, "")
    .replace(/\s+/g, "")
    .replace(/\.$/, "");

const toIsoDate = (year: string, month: string, day: string) =>
  `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

// Slashed dates are day first, unless the file has one that only works month first (12/31/2026),
// which means Excel used US settings for the whole file.
const slashedMonthFirst = (values: (string | undefined)[]) =>
  values.some((value) => {
    const match = value && cleanDate(value).match(SLASHED);
    return match ? Number(match[1]) <= 12 && Number(match[2]) > 12 : false;
  });

// Returns YYYY-MM-DD, or the value unchanged so the validator rejects it.
const normalizeDate = (value: string | undefined, monthFirst: boolean) => {
  if (!value) return value;
  const date = cleanDate(value);

  let match = date.match(YEAR_FIRST);
  if (match) return toIsoDate(match[1]!, match[2]!, match[3]!);
  match = date.match(DAY_FIRST);
  if (match) return toIsoDate(match[3]!, match[2]!, match[1]!);
  match = date.match(SLASHED);
  if (match) {
    const [, first, second, year] = match;
    return monthFirst ? toIsoDate(year!, first!, second!) : toIsoDate(year!, second!, first!);
  }
  if (EXCEL_SERIAL.test(date)) {
    return new Date(EXCEL_EPOCH + Number(date) * DAY_MS).toISOString().slice(0, 10);
  }
  return value;
};

const INVALID_DATE = "Expiry date is not valid.";

// Parses and validates a whole product CSV. Products are returned only when every row is valid.
export function parseProductCsv(buffer: Buffer): CsvParseResult {
  const text = buffer.toString("utf8");

  let records: { record: Record<string, string>; info: { lines: number } }[];
  try {
    records = parse(text, {
      columns: (header: string[]) => header.map((column) => column.trim().toLowerCase()),
      delimiter: detectDelimiter(text),
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      info: true,
    });
  } catch {
    return { error: "The CSV file could not be read." };
  }

  if (records.length === 0) {
    return { error: "The CSV file does not contain any products." };
  }
  const columns = Object.keys(records[0]!.record);
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    return { error: `The CSV file is missing columns: ${missing.join(", ")}.` };
  }
  if (records.length > MAX_CSV_ROWS) {
    return { error: `The CSV file can contain at most ${MAX_CSV_ROWS} products.` };
  }

  const products: ProductFields[] = [];
  const rowErrors: CsvRowError[] = [];
  const monthFirst = slashedMonthFirst(records.map(({ record }) => record.expiry_date));
  for (const { record, info } of records) {
    const product: ProductFields = {
      name: record.name ?? "",
      ...(record.description ? { description: record.description } : {}),
      category: record.category ?? "",
      original_price: normalizeNumber(record.original_price) ?? "",
      discounted_price: normalizeNumber(record.discounted_price) ?? "",
      quantity: normalizeNumber(record.quantity) ?? "",
      unit: record.unit ?? "",
      expiry_date: normalizeDate(record.expiry_date, monthFirst) ?? "",
    };
    const error = validateProductFields(product);
    if (error === INVALID_DATE) {
      // Show what arrived, since Excel may have saved something other than what the user typed.
      rowErrors.push({
        row: info.lines,
        error: `Expiry date is not valid: "${record.expiry_date}". Use the format 31.12.2026.`,
      });
    } else if (error) {
      rowErrors.push({ row: info.lines, error });
    } else {
      products.push(product);
    }
  }

  if (rowErrors.length > 0) {
    return { error: "The CSV contains invalid rows.", rowErrors };
  }
  return { products };
}
