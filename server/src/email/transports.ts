import nodemailer from "nodemailer";
import type { EmailConfig, EmailProvider } from "./config.js";

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendOptions {
  // The same key for every attempt of one email, so a retry after a timeout cannot send it twice
  // (Resend honours it; the other transports ignore it).
  idempotencyKey?: string;
}

// One interface, three transports. send() resolves when the provider accepted the email and
// throws otherwise; the queue decides about retries.
export interface EmailTransport {
  readonly name: EmailProvider;
  send(message: EmailMessage, options?: SendOptions): Promise<void>;
}

// The default: nothing leaves the machine, the email is only written to the console.
export const createLogTransport = (log: (line: string) => void = console.log): EmailTransport => ({
  name: "log",
  send: async (message) => {
    log(
      `[email] Not sent (EMAIL_PROVIDER=log). From: ${message.from} | To: ${message.to} | Subject: ${message.subject}\n${message.text}`,
    );
  },
});

// The part of a nodemailer transporter we use, so tests can pass a fake one.
export interface SmtpClient {
  sendMail(mail: EmailMessage): Promise<unknown>;
}
export type SmtpClientFactory = (options: { host: string; port: number; secure: boolean }) => SmtpClient;

const nodemailerFactory: SmtpClientFactory = (options) => nodemailer.createTransport(options);

// Local development and e2e: Mailpit catches every email (no authentication, no TLS).
export const createSmtpTransport = (
  options: { host: string; port: number },
  createClient: SmtpClientFactory = nodemailerFactory,
): EmailTransport => {
  // 465 is SMTP over TLS; every other port starts in plain text (Mailpit uses 1025).
  const client = createClient({ host: options.host, port: options.port, secure: options.port === 465 });
  return {
    name: "smtp",
    send: async (message) => {
      await client.sendMail(message);
    },
  };
};

export const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 15_000;

// Resend through its HTTP API, not SMTP: some hosts block the SMTP ports.
export const createResendTransport = (
  options: { apiKey: string },
  fetchFn: typeof fetch = fetch,
): EmailTransport => ({
  name: "resend",
  send: async (message, sendOptions = {}) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    };
    if (sendOptions.idempotencyKey) headers["Idempotency-Key"] = sendOptions.idempotencyKey;
    const response = await fetchFn(RESEND_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Resend answers errors as { statusCode, name, message }.
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { message?: unknown };
        if (typeof body.message === "string") detail = body.message;
      } catch {
        // Not JSON: keep the status text.
      }
      throw new Error(`Resend responded with ${response.status}: ${detail}`);
    }
  },
});

export const createEmailTransport = (config: EmailConfig): EmailTransport => {
  if (config.provider === "smtp" && config.smtp) return createSmtpTransport(config.smtp);
  if (config.provider === "resend" && config.resend) return createResendTransport(config.resend);
  return createLogTransport();
};
