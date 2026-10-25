import { EMPTY_DONATION_FORM, validateDonationForm } from "./donations.js";
import { REQUIRED } from "./validation.js";
import type { DonationFormValues } from "../types/index.js";

const filled: DonationFormValues = {
  ...EMPTY_DONATION_FORM,
  name: "Hljeb",
  category: "Bakery",
  quantity: "20",
  unit: "kom",
  original_price: "2",
  expiry_date: "2030-01-01",
};

describe("validateDonationForm", () => {
  it("returns one error per empty required field", () => {
    expect(validateDonationForm({ ...EMPTY_DONATION_FORM, name: "   " })).toEqual({
      name: REQUIRED,
      category: REQUIRED,
      quantity: REQUIRED,
      unit: REQUIRED,
      original_price: REQUIRED,
      expiry_date: REQUIRED,
    });
  });

  it("accepts a complete free donation", () => {
    expect(validateDonationForm(filled)).toEqual({});
  });

  it("requires a donation price below the value only for a paid donation", () => {
    expect(validateDonationForm({ ...filled, donation_type: "SPONSORED" })).toEqual({ donation_price: REQUIRED });
    expect(validateDonationForm({ ...filled, donation_type: "SPONSORED", donation_price: "3" })).toEqual({
      donation_price: "donations.form.priceInvalid",
    });
    expect(validateDonationForm({ ...filled, donation_type: "SPONSORED", donation_price: "1" })).toEqual({});
  });

  it("flags a pickup window that does not end after it starts", () => {
    expect(validateDonationForm({ ...filled, pickup_from: "18:00", pickup_until: "09:00" })).toEqual({
      pickup_until: "donations.form.invalidPickup",
    });
    expect(validateDonationForm({ ...filled, pickup_from: "09:00" })).toEqual({});
  });
});
