import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";

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

// How a new account gets in, when an admin or a headquarters creates it: an invitation email with
// a link to set the first password (the default), or a temporary password the creator passes on
// (for users without email access), which must be replaced at the first login.
export type CreateMethod = "INVITE" | "PASSWORD";
const CREATE_METHODS: readonly string[] = ["INVITE", "PASSWORD"];
export const INVALID_CREATE_METHOD = "Choose an invitation or a temporary password.";

// The chosen method, or null when it is not one of the two. Without a method, a password means a
// temporary password (as before invitations existed).
export const parseCreateMethod = (body: { method?: unknown; password?: unknown }): CreateMethod | null => {
  const method = body.method ?? (body.password ? "PASSWORD" : "INVITE");
  return typeof method === "string" && CREATE_METHODS.includes(method) ? (method as CreateMethod) : null;
};

// The first password hash: the temporary password, or for an invitation the hash of a random value
// nobody knows (the user has no password until they set one from the link).
export const initialPasswordHash = (method: CreateMethod, password: unknown) =>
  hashPassword(method === "INVITE" ? randomBytes(32).toString("base64url") : (password as string));
