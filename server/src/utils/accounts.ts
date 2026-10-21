import bcrypt from "bcrypt";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;
const SALT_ROUNDS = 10;

// Emails are compared case-insensitively, so they are stored and looked up in lowercase.
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const validateEmail = (email: unknown) =>
  typeof email !== "string" || !EMAIL_PATTERN.test(normalizeEmail(email))
    ? "Email nije ispravan."
    : null;

export const validatePassword = (password: unknown) =>
  typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH
    ? `Lozinka mora imati najmanje ${MIN_PASSWORD_LENGTH} znakova.`
    : null;

export const hashPassword = (password: string) => bcrypt.hash(password, SALT_ROUNDS);

// Postgres unique_violation, e.g. two accounts created with the same email at the same moment.
export const isUniqueViolation = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "23505";
