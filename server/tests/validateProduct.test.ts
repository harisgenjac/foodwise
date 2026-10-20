import { validateProductFields, type ProductFields } from "../src/utils/validateProduct.js";

const valid: ProductFields = {
  name: "Mlijeko",
  category: "Dairy",
  original_price: "2.5",
  discounted_price: "1.2",
  quantity: "10",
  unit: "kom",
  expiry_date: "2030-01-01",
};

describe("validateProductFields", () => {
  it("accepts a valid product", () => {
    expect(validateProductFields(valid)).toBeNull();
  });

  it("accepts numbers as well as numeric strings and equal prices", () => {
    const numeric = { ...valid, original_price: 3, discounted_price: 3, quantity: 0.5 };
    expect(validateProductFields(numeric as unknown as ProductFields)).toBeNull();
  });

  it("does not require a description", () => {
    expect(validateProductFields({ ...valid, description: "" })).toBeNull();
  });

  it.each(["name", "category", "original_price", "discounted_price", "quantity", "unit", "expiry_date"] as const)(
    "requires %s",
    (field) => {
      expect(validateProductFields({ ...valid, [field]: "" })).toBe("Sva polja su obavezna.");
    },
  );

  it.each([
    ["original_price", "-1"],
    ["discounted_price", "-1"],
    ["quantity", "-3"],
    ["quantity", "abc"],
    ["original_price", "0"],
  ] as const)("rejects %s = %s", (field, value) => {
    expect(validateProductFields({ ...valid, [field]: value })).toBe(
      "Cijene i količina moraju biti pozitivni brojevi.",
    );
  });

  it("rejects a discounted price above the original price", () => {
    expect(validateProductFields({ ...valid, original_price: "5", discounted_price: "6" })).toBe(
      "Snižena cijena ne može biti veća od originalne.",
    );
  });

  it("rejects an invalid expiry date", () => {
    expect(validateProductFields({ ...valid, expiry_date: "not-a-date" })).toBe("Datum isteka nije ispravan.");
  });
});
