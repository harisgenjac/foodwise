import { createHmac, timingSafeEqual } from "node:crypto";
import { DeliveryError, type WebhookHeaders } from "./types.js";

// Webhook signatures (openapi.yaml, "Webhook signature"): the provider sends
//   X-JosVrijedi-Timestamp: <unix seconds>
//   X-JosVrijedi-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
// The timestamp is signed too, so an old call cannot be replayed with a fresh timestamp.
export const TIMESTAMP_HEADER = "x-josvrijedi-timestamp";
export const SIGNATURE_HEADER = "x-josvrijedi-signature";
// How far the timestamp may be from our clock, in either direction.
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

const hmac = (secret: string, timestamp: number, rawBody: string) =>
  createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

export const signWebhook = (secret: string, rawBody: string, now: Date = new Date()): Record<string, string> => {
  const timestamp = Math.floor(now.getTime() / 1000);
  return {
    [TIMESTAMP_HEADER]: String(timestamp),
    [SIGNATURE_HEADER]: `sha256=${hmac(secret, timestamp, rawBody)}`,
  };
};

// Express lowercases header names; a repeated header arrives as an array and is refused.
const header = (headers: WebhookHeaders, name: string): string | null => {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];
  return typeof value === "string" ? value.trim() : null;
};

const invalid = (message: string) => new DeliveryError(401, "INVALID_SIGNATURE", message);

export const verifyWebhook = (
  secret: string,
  rawBody: string,
  headers: WebhookHeaders,
  now: Date = new Date(),
): void => {
  const timestampValue = header(headers, TIMESTAMP_HEADER);
  const signatureValue = header(headers, SIGNATURE_HEADER);
  if (timestampValue === null || signatureValue === null) {
    throw invalid("Webhook signature is missing.");
  }
  if (!/^\d{1,12}$/.test(timestampValue)) throw invalid("Webhook signature is not valid.");
  const timestamp = Number(timestampValue);
  if (Math.abs(now.getTime() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    throw invalid("Webhook timestamp is outside the allowed window.");
  }

  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureValue);
  if (!match) throw invalid("Webhook signature is not valid.");
  const expected = Buffer.from(hmac(secret, timestamp, rawBody), "hex");
  const received = Buffer.from(match[1]!.toLowerCase(), "hex");
  // Both are 32 bytes here (the regex checked the length), so timingSafeEqual cannot throw.
  if (!timingSafeEqual(expected, received)) throw invalid("Webhook signature is not valid.");
};
