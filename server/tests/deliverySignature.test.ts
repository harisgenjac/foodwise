import { createHmac } from "node:crypto";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  WEBHOOK_TOLERANCE_SECONDS,
  signWebhook,
  verifyWebhook,
} from "../src/delivery/signature.js";
import { DeliveryError } from "../src/delivery/types.js";

const SECRET = "test-webhook-secret-123";
const BODY = JSON.stringify({ event_id: "evt_1", type: "delivery.picked_up" });
const NOW = new Date("2026-11-16T10:00:00Z");

const refusal = (fn: () => void): DeliveryError => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DeliveryError);
    return error as DeliveryError;
  }
  throw new Error("Expected a refusal.");
};

describe("webhook signature", () => {
  it("signs the timestamp and the raw body with HMAC-SHA256", () => {
    const headers = signWebhook(SECRET, BODY, NOW);
    const timestamp = String(NOW.getTime() / 1000);
    expect(headers[TIMESTAMP_HEADER]).toBe(timestamp);
    const expected = createHmac("sha256", SECRET).update(`${timestamp}.${BODY}`).digest("hex");
    expect(headers[SIGNATURE_HEADER]).toBe(`sha256=${expected}`);
  });

  it("accepts a valid signature, with any header case and an upper-case digest", () => {
    const headers = signWebhook(SECRET, BODY, NOW);
    expect(() => verifyWebhook(SECRET, BODY, headers, NOW)).not.toThrow();
    const upper = {
      "X-FoodWise-Timestamp": headers[TIMESTAMP_HEADER],
      "X-FoodWise-Signature": headers[SIGNATURE_HEADER]!.replace(/[0-9a-f]{64}/, (hex) => hex.toUpperCase()),
    };
    expect(() => verifyWebhook(SECRET, BODY, upper, NOW)).not.toThrow();
  });

  it("refuses a changed body and a wrong secret", () => {
    const headers = signWebhook(SECRET, BODY, NOW);
    const changed = refusal(() => verifyWebhook(SECRET, BODY.replace("picked_up", "delivered"), headers, NOW));
    expect(changed).toMatchObject({ status: 401, code: "INVALID_SIGNATURE", message: "Webhook signature is not valid." });
    expect(refusal(() => verifyWebhook("another-secret-12345", BODY, headers, NOW)).message).toBe(
      "Webhook signature is not valid.",
    );
  });

  it("refuses a signature with a replaced timestamp", () => {
    const headers = signWebhook(SECRET, BODY, NOW);
    const replayed = { ...headers, [TIMESTAMP_HEADER]: String(NOW.getTime() / 1000 + 60) };
    expect(refusal(() => verifyWebhook(SECRET, BODY, replayed, NOW)).message).toBe("Webhook signature is not valid.");
  });

  it("accepts a timestamp at the edge of the window and refuses one outside it, in both directions", () => {
    const edge = WEBHOOK_TOLERANCE_SECONDS * 1000;
    for (const offset of [-edge, edge]) {
      const headers = signWebhook(SECRET, BODY, new Date(NOW.getTime() + offset));
      expect(() => verifyWebhook(SECRET, BODY, headers, NOW)).not.toThrow();
    }
    for (const offset of [-edge - 1000, edge + 1000]) {
      const headers = signWebhook(SECRET, BODY, new Date(NOW.getTime() + offset));
      expect(refusal(() => verifyWebhook(SECRET, BODY, headers, NOW)).message).toBe(
        "Webhook timestamp is outside the allowed window.",
      );
    }
  });

  it("refuses missing, repeated and malformed headers", () => {
    const headers = signWebhook(SECRET, BODY, NOW);
    const { [SIGNATURE_HEADER]: _signature, ...withoutSignature } = headers;
    const { [TIMESTAMP_HEADER]: _timestamp, ...withoutTimestamp } = headers;
    expect(refusal(() => verifyWebhook(SECRET, BODY, withoutSignature, NOW)).message).toBe(
      "Webhook signature is missing.",
    );
    expect(refusal(() => verifyWebhook(SECRET, BODY, withoutTimestamp, NOW)).message).toBe(
      "Webhook signature is missing.",
    );
    const repeated = { ...headers, [SIGNATURE_HEADER]: [headers[SIGNATURE_HEADER]!, headers[SIGNATURE_HEADER]!] };
    expect(refusal(() => verifyWebhook(SECRET, BODY, repeated, NOW)).message).toBe("Webhook signature is missing.");

    const malformed = [
      { ...headers, [TIMESTAMP_HEADER]: "yesterday" },
      { ...headers, [SIGNATURE_HEADER]: headers[SIGNATURE_HEADER]!.replace("sha256=", "sha1=") },
      // A digest of the wrong length must be refused, not crash timingSafeEqual.
      { ...headers, [SIGNATURE_HEADER]: headers[SIGNATURE_HEADER]!.slice(0, -2) },
      { ...headers, [SIGNATURE_HEADER]: `${headers[SIGNATURE_HEADER]!}00` },
    ];
    for (const bad of malformed) {
      expect(refusal(() => verifyWebhook(SECRET, BODY, bad, NOW)).message).toBe("Webhook signature is not valid.");
    }
  });
});
