import i18n from "../i18n/config.js";
import type { OrderDelivery } from "../types/index.js";
import { deliveryFailureKey } from "./orders.js";

const delivery = (overrides: Partial<OrderDelivery> = {}): OrderDelivery => ({
  status: "FAILED",
  price: "9.10",
  cash_to_collect: "19.10",
  estimated_pickup_at: null,
  estimated_delivery_at: null,
  courier_name: null,
  courier_phone: null,
  tracking_url: null,
  failure_code: null,
  failure_reason: null,
  picked_up_at: null,
  ...overrides,
});

describe("deliveryFailureKey", () => {
  it("reads the delivery service's failure codes", () => {
    for (const code of ["NO_COURIER", "OUT_OF_ZONE", "RECIPIENT_CLOSED", "OTHER"] as const) {
      expect(deliveryFailureKey(delivery({ failure_code: code }))).toBe(code);
    }
    expect(deliveryFailureKey(delivery({ status: "CANCELLED", failure_code: "CANCELLED_BY_SERVICE" }))).toBe(
      "CANCELLED_BY_SERVICE",
    );
  });

  it("after the pickup keeps a specific code and otherwise says the courier had the goods", () => {
    const pickedUp = { picked_up_at: "2030-01-01T10:00:00Z" };
    expect(deliveryFailureKey(delivery({ ...pickedUp, failure_code: "RECIPIENT_CLOSED" }))).toBe("RECIPIENT_CLOSED");
    expect(deliveryFailureKey(delivery({ ...pickedUp, failure_code: "OTHER" }))).toBe("afterPickup");
    expect(deliveryFailureKey(delivery(pickedUp))).toBe("afterPickup");
  });

  it("keeps our own reasons: an admin's cancel and a delivery that could not be booked", () => {
    expect(deliveryFailureKey(delivery({ status: "CANCELLED", failure_reason: "CANCELLED_BY_ADMIN" }))).toBe("admin");
    expect(deliveryFailureKey(delivery({ price: null, failure_reason: "OUT_OF_ZONE" }))).toBe("OUT_OF_ZONE");
    expect(deliveryFailureKey(delivery({ price: null, failure_reason: "STORE_NO_LOCATION" }))).toBe("other");
    // Rows from before the codes.
    expect(deliveryFailureKey(delivery({ status: "CANCELLED", failure_reason: "CANCELLED_BY_PROVIDER" }))).toBe("cancelled");
    expect(deliveryFailureKey(delivery({ failure_reason: "Courier could not reach the store." }))).toBe("courier");
  });

  it("has a text for every key in both languages", () => {
    const keys = ["admin", "afterPickup", "NO_COURIER", "OUT_OF_ZONE", "CANCELLED_BY_SERVICE", "RECIPIENT_CLOSED", "OTHER", "cancelled", "courier", "other"];
    for (const language of ["bs", "en"]) {
      for (const key of keys) {
        expect(i18n.exists(`orders.delivery.failure.${key}`, { lng: language }), `${language} ${key}`).toBe(true);
      }
    }
  });
});
