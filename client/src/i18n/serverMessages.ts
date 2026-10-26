import i18n from "./config.js";
import BS from "./locales/server.bs.json";

// The server writes every `error` and `message` in English. In Bosnian they are looked up in
// server.bs.json by their exact English text; a key with {{placeholders}} matches texts that carry
// a value (a number, a column list, a reason) and the value is put into the translation.
// Unknown texts are shown as they are. serverMessages.test.ts checks that every server text has a key.
const TRANSLATIONS: Record<string, string> = BS;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TEMPLATES = Object.keys(TRANSLATIONS)
  .filter((key) => key.includes("{{"))
  .map((key) => {
    const names: string[] = [];
    const source = key
      .split(/\{\{(\w+)\}\}/)
      .map((part, index) => {
        if (index % 2 === 0) return escapeRegExp(part);
        names.push(part);
        return "(.+?)";
      })
      .join("");
    return { key, names, regex: new RegExp(`^${source}$`, "s") };
  });

export function translateServerMessage(text: string): string {
  if (i18n.language?.startsWith("en")) return text;
  const exact = TRANSLATIONS[text];
  if (exact) return exact;
  for (const { key, names, regex } of TEMPLATES) {
    const match = regex.exec(text);
    if (match) {
      return names.reduce((result, name, index) => result.replaceAll(`{{${name}}}`, match[index + 1]!), TRANSLATIONS[key]!);
    }
  }
  return text;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;

// Translates the top-level `error` and `message` of a JSON response, and the CSV import's `rowErrors`.
export function translateServerData<T>(data: T): T {
  if (!isPlainObject(data)) return data;
  const translated: Record<string, unknown> = { ...data };
  for (const field of ["error", "message"]) {
    if (typeof translated[field] === "string") translated[field] = translateServerMessage(translated[field]);
  }
  if (Array.isArray(translated.rowErrors)) {
    translated.rowErrors = translated.rowErrors.map((row: unknown) =>
      isPlainObject(row) && typeof row.error === "string" ? { ...row, error: translateServerMessage(row.error) } : row,
    );
  }
  return translated as T;
}
