import bcrypt from "bcrypt";

export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
const SALT_ROUNDS = 10;

// Emails are compared case-insensitively, so they are stored and looked up in lowercase.
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// local@domain.tld: one "@", no whitespace, a non-empty local part and a domain with a dot that is
// neither its first nor its last character. Checked without a backtracking regex (ReDoS) and
// capped at 254 characters, the longest address SMTP allows.
export const isValidEmail = (email: string) => {
  if (email.length > MAX_EMAIL_LENGTH || /\s/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts as [string, string];
  return local.length > 0 && domain.slice(1, -1).includes(".");
};

export const validateEmail = (email: unknown) =>
  typeof email !== "string" || !isValidEmail(normalizeEmail(email)) ? "Email is not valid." : null;

export const validatePassword = (password: unknown) =>
  typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH
    ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
    : null;

export const hashPassword = (password: string) => bcrypt.hash(password, SALT_ROUNDS);

// Postgres unique_violation, e.g. two accounts created with the same email at the same moment.
export const isUniqueViolation = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "23505";
