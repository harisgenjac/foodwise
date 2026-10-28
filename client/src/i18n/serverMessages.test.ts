import i18n from "./config.js";
import BS from "./locales/server.bs.json";
import { translateServerData, translateServerMessage } from "./serverMessages.js";

describe("translateServerMessage", () => {
  it("translates a known server text into Bosnian", () => {
    expect(translateServerMessage("Reservation cancelled successfully.")).toBe("Rezervacija je uspješno otkazana.");
  });

  it("keeps the English text in the English interface", async () => {
    await i18n.changeLanguage("en");
    expect(translateServerMessage("Reservation cancelled successfully.")).toBe("Reservation cancelled successfully.");
  });

  it("puts the values of a text with placeholders into the translation", () => {
    expect(translateServerMessage("Password must be at least 8 characters long.")).toBe(
      "Lozinka mora imati najmanje 8 znakova.",
    );
    expect(translateServerMessage("The CSV file is missing columns: naziv, kategorija.")).toBe(
      "U CSV datoteci nedostaju kolone: naziv, kategorija.",
    );
    expect(translateServerMessage("Your account is blocked. Reason: Spam.")).toBe("Vaš nalog je blokiran. Razlog: Spam.");
    expect(translateServerMessage("Your account is blocked.")).toBe("Vaš nalog je blokiran.");
  });

  it("shows an unknown text as it is", () => {
    expect(translateServerMessage("Something new happened.")).toBe("Something new happened.");
  });
});

describe("translateServerData", () => {
  it("translates error, message and the CSV row errors, and keeps the rest", () => {
    const data = {
      error: "The CSV contains invalid rows.",
      rowErrors: [{ row: 3, error: "Category is not valid." }],
      message: "Request sent.",
      request: { id: 1 },
    };
    expect(translateServerData(data)).toEqual({
      error: "CSV sadrži neispravne redove.",
      rowErrors: [{ row: 3, error: "Kategorija nije ispravna." }],
      message: "Zahtjev je poslan.",
      request: { id: 1 },
    });
  });

  it("leaves blobs, arrays and texts alone", () => {
    const blob = new Blob(["a"]);
    expect(translateServerData(blob)).toBe(blob);
    expect(translateServerData(["Request sent."])).toEqual(["Request sent."]);
    expect(translateServerData("Request sent.")).toBe("Request sent.");
  });
});

// Every English text the server can send must have a Bosnian translation, and every translation
// must still match a server text. The server sources are read as raw text.
describe("server texts", () => {
  const sources = import.meta.glob(
    [
      "../../../server/src/{controllers,middleware,services,utils}/**/*.ts",
      "../../../server/src/app.ts",
      "!../../../server/src/**/*.test.ts",
    ],
    { query: "?raw", import: "default", eager: true },
  ) as Record<string, string>;

  // Capitalized texts with a space that are not API responses: notification fallbacks (the UI
  // translates notifications by type), CSV report headers, category names and route names.
  const NOT_RESPONSES = [
    /^New reservation request: /,
    /^Your reservation for /,
    /^A reservation for /,
    /^Pickup of /,
    /^New .* request waiting for approval\.$/,
    /^Your .* request was /,
    // Credit notifications about a branch (to its headquarters, and the headquarters' answer).
    /^A branch /,
    /^Your company (sent|rejected) your top-up request/,
    /^Reservation cancelled by the platform administrator: /,
    /^Reservation cancelled because the store is no longer active: /,
    /^Branch 7 by the platform administrator: /,
    /^Your (product|donation) was removed by the platform administrator: /,
    /^Platform announcement: /,
    /\(KM\)$/,
    /^Food saved \(/,
    /^(Bakery Products|Dairy Products|Frozen Food|Favorites only|Pickup date|Reservation no\.)$/,
    /^(Broj|Datum|Pekarski|Smrznuta|Mliječni|Spašena) /,
    /^(GET|POST|PUT|PATCH|DELETE) \/api\//,
    /^(SELECT|UPDATE|INSERT|DELETE|WITH|FROM|FOR|COALESCE|SAVEPOINT|RELEASE|ROLLBACK)[ (]/,
    // `Your account is blocked.${reason}`: the reason part has its own key (see below).
    /^Your account is blocked\.7$/,
  ];

  // A template literal stands for any value: `${...}` becomes a sample value.
  const texts = new Set<string>();
  for (const source of Object.values(sources)) {
    for (const line of source.split("\n")) {
      if (line.includes("console.")) continue;
      for (const [, quoted, template] of line.matchAll(/"([A-Z][^"\s]* [^"]*)"|`([A-Z][^`\s]* [^`]*)`/g)) {
        const text = quoted ?? template!.replace(/\$\{[^}]+\}/g, "7");
        if (!NOT_RESPONSES.some((pattern) => pattern.test(text))) texts.add(text);
      }
    }
  }

  it("finds the server texts", () => {
    expect(texts.size).toBeGreaterThan(200);
  });

  it("has a Bosnian translation for every server text", () => {
    const untranslated = [...texts].filter((text) => translateServerMessage(text) === text);
    expect(untranslated).toEqual([]);
  });

  it("has no translation for a text the server no longer sends", () => {
    // The blocked reason is appended to the message as " Reason: ..." in a separate literal.
    const unused = Object.keys(BS).filter(
      (key) => !key.startsWith("Your account is blocked. Reason:") && !texts.has(key.replace(/\{\{\w+\}\}/g, "7")),
    );
    expect(unused).toEqual([]);
  });
});
