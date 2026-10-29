import { MAX_EMAIL_LENGTH, validateEmail } from "../src/utils/accounts.js";

// The pattern the check replaced (it backtracked polynomially on long input). Both must agree
// on every address of a sane length.
const OLD_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALID = [
  "user@example.com",
  "first.last@sub.example.co.uk",
  "a@b.c",
  "UPPER@EXAMPLE.COM",
  "  padded@example.com  ",
  "name+tag@example.ba",
  "x@a.b.c",
  "weird!#$%&'*@example.com",
  "a@b..c",
  "ćevap@pekara.ba",
];

const INVALID = [
  "",
  "plain",
  "@example.com",
  "user@",
  "user@example",
  "user@.com",
  "user@example.",
  "user@@example.com",
  "us er@example.com",
  "user@exa mple.com",
  "user@example.com\tx",
  "a@b@c.d",
  "a@.",
  "a@b.",
  "a@.b",
];

describe("validateEmail", () => {
  it.each(VALID)("accepts %j, like the old pattern", (email) => {
    expect(OLD_PATTERN.test(email.trim().toLowerCase())).toBe(true);
    expect(validateEmail(email)).toBeNull();
  });

  it.each(INVALID)("rejects %j, like the old pattern", (email) => {
    expect(OLD_PATTERN.test(email.trim().toLowerCase())).toBe(false);
    expect(validateEmail(email)).toBe("Email is not valid.");
  });

  it("rejects anything that is not a string", () => {
    for (const value of [undefined, null, 42, {}, ["a@b.c"]]) {
      expect(validateEmail(value)).toBe("Email is not valid.");
    }
  });

  it("accepts 254 characters and rejects 255", () => {
    const at = (length: number) => `${"a".repeat(length - "@example.com".length)}@example.com`;
    expect(at(MAX_EMAIL_LENGTH)).toHaveLength(254);
    expect(validateEmail(at(MAX_EMAIL_LENGTH))).toBeNull();
    expect(validateEmail(at(MAX_EMAIL_LENGTH + 1))).toBe("Email is not valid.");
  });

  it("answers at once for long malicious input", () => {
    const inputs = [
      `a@${".".repeat(100_000)}`,
      `a@${"a.".repeat(50_000)} `,
      `${"a".repeat(100_000)}@${"b".repeat(100_000)}`,
    ];
    const start = performance.now();
    for (const input of inputs) expect(validateEmail(input)).toBe("Email is not valid.");
    expect(performance.now() - start).toBeLessThan(50);
  });
});
