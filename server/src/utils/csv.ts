export type CsvCell = string | number | null;

// Bosnian Excel splits columns on ";" and reads "2,50" as a number; the BOM makes it read UTF-8.
const DELIMITER = ";";
const BOM = "﻿";

// Spreadsheet apps run a cell starting with one of these as a formula, and product and
// business names are user input, so such text gets a leading apostrophe (shown as plain text).
const FORMULA_START = /^[=+\-@\t\r]/;

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");

const formatCell = (cell: CsvCell): string => {
  if (cell === null) return "";
  if (typeof cell === "number") return formatNumber(cell);

  const text = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Builds a CSV file (header line plus rows) that Excel opens with the columns split.
export const toCsv = (headers: string[], rows: CsvCell[][]): string =>
  BOM + [headers, ...rows].map((row) => row.map(formatCell).join(DELIMITER)).join("\r\n") + "\r\n";
