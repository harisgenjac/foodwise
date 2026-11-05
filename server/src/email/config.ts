import { isValidEmail } from "../utils/accounts.js";

// Email settings, read from the environment once at startup (server.ts). Going live is only a
// change of variables: EMAIL_PROVIDER=resend, EMAIL_FROM, RESEND_API_KEY and no EMAIL_REDIRECT_TO.
export const EMAIL_PROVIDERS = ["log", "smtp", "resend"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export interface EmailConfig {
  provider: EmailProvider;
  from: string;
  // When set, every email goes to this address instead of its recipient (see redirect.ts).
  redirectTo: string | null;
  // The frontend origin the links in emails point to: the first CLIENT_ORIGIN.
  appUrl: string;
  smtp: { host: string; port: number } | null;
  resend: { apiKey: string } | null;
}

export class EmailConfigError extends Error {}

export const DEFAULT_EMAIL_FROM = "FoodWise <no-reply@foodwise.local>";
export const DEFAULT_SMTP_HOST = "localhost";
// Mailpit's SMTP port.
export const DEFAULT_SMTP_PORT = 1025;
const DEFAULT_APP_URL = "http://localhost:5173";

// An empty or whitespace-only variable counts as not set.
const read = (env: NodeJS.ProcessEnv, name: string): string | null => {
  const value = env[name]?.trim();
  return value ? value : null;
};

// "FoodWise <no-reply@example.com>" or a bare address.
const isValidSender = (from: string) => {
  const match = /^[^<>]*<([^<>]+)>$/.exec(from);
  return isValidEmail(match ? match[1]!.trim() : from);
};

const parsePort = (value: string | null): number => {
  if (value === null) return DEFAULT_SMTP_PORT;
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new EmailConfigError(`SMTP_PORT must be a port number (1-65535), got "${value}".`);
  }
  return port;
};

// Throws EmailConfigError for a setting that is not valid; the server refuses to start with it.
export const loadEmailConfig = (env: NodeJS.ProcessEnv = process.env): EmailConfig => {
  const providerValue = read(env, "EMAIL_PROVIDER") ?? "log";
  if (!(EMAIL_PROVIDERS as readonly string[]).includes(providerValue)) {
    throw new EmailConfigError(
      `EMAIL_PROVIDER must be one of ${EMAIL_PROVIDERS.join(", ")}, got "${providerValue}".`,
    );
  }
  const provider = providerValue as EmailProvider;

  const fromValue = read(env, "EMAIL_FROM");
  if (provider === "resend" && fromValue === null) {
    throw new EmailConfigError("EMAIL_FROM is required with EMAIL_PROVIDER=resend.");
  }
  const from = fromValue ?? DEFAULT_EMAIL_FROM;
  if (!isValidSender(from)) {
    throw new EmailConfigError(`EMAIL_FROM is not a valid sender: "${from}".`);
  }

  const redirectTo = read(env, "EMAIL_REDIRECT_TO")?.toLowerCase() ?? null;
  if (redirectTo !== null && !isValidEmail(redirectTo)) {
    throw new EmailConfigError(`EMAIL_REDIRECT_TO is not a valid email address: "${redirectTo}".`);
  }

  let resend: EmailConfig["resend"] = null;
  if (provider === "resend") {
    const apiKey = read(env, "RESEND_API_KEY");
    if (apiKey === null) {
      throw new EmailConfigError("RESEND_API_KEY is required with EMAIL_PROVIDER=resend.");
    }
    // Safety rule: a real email service outside production only ever writes to one test inbox.
    if (env.NODE_ENV !== "production" && redirectTo === null) {
      throw new EmailConfigError(
        "EMAIL_PROVIDER=resend outside production requires EMAIL_REDIRECT_TO, so no real person gets an email.",
      );
    }
    resend = { apiKey };
  }

  const smtp =
    provider === "smtp"
      ? { host: read(env, "SMTP_HOST") ?? DEFAULT_SMTP_HOST, port: parsePort(read(env, "SMTP_PORT")) }
      : null;

  const appUrl =
    (read(env, "CLIENT_ORIGIN") ?? DEFAULT_APP_URL)
      .split(",")
      .map((origin) => origin.trim())
      .find(Boolean)
      ?.replace(/\/+$/, "") ?? DEFAULT_APP_URL;

  return { provider, from, redirectTo, appUrl, smtp, resend };
};
