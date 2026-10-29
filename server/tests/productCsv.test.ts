import { parseProductCsv } from "../src/utils/productCsv.js";
import { CATEGORIES } from "../src/utils/validateProduct.js";

const HEADER = "name;category;original_price;discounted_price;quantity;unit;expiry_date";
// Next year, so the dates never fall into the past.
const Y = new Date().getFullYear() + 1;
const csv = (expiry: string) => Buffer.from(`${HEADER}\nHljeb;${CATEGORIES[0]};2,00;1,00;5;kom;${expiry}\n`);

describe("parseProductCsv expiry dates", () => {
  it.each([
    [`31.12.${Y}`, `${Y}-12-31`],
    [`31. 12. ${Y}.`, `${Y}-12-31`],
    [`${Y}-12-31 00:00:00`, `${Y}-12-31`],
    [`${Y}-12-31T00:00:00Z`, `${Y}-12-31`],
    [`31.12.${Y} 10:30 PM`, `${Y}-12-31`],
  ])("still reads %j", (expiry, iso) => {
    const result = parseProductCsv(csv(expiry));
    expect(result.error).toBeUndefined();
    expect("products" in result && result.products[0]!.expiry_date).toBe(iso);
  });

  it("rejects a long cell at once instead of backtracking (ReDoS)", () => {
    const inputs = [
      `1${" ".repeat(200_000)}x`,
      `"${"T\n".repeat(100_000)}x"`,
    ];
    const start = performance.now();
    for (const input of inputs) {
      const result = parseProductCsv(csv(input));
      expect(result.error).toBe("The CSV contains invalid rows.");
    }
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
