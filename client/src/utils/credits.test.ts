import { getCreditError } from "./credits.js";
import { axiosError, creditError } from "../test/utils.js";

describe("getCreditError", () => {
  it("reads the 402 INSUFFICIENT_CREDITS body", () => {
    expect(getCreditError(creditError(true))).toEqual({ hasActiveSubscription: true, actionUrl: "/my-profile#topup" });
    expect(getCreditError(creditError(false))).toEqual({
      hasActiveSubscription: false,
      actionUrl: "/my-profile#subscription",
    });
  });

  it("ignores every other error", () => {
    expect(getCreditError(axiosError(400, "Not enough product available."))).toBeNull();
    expect(getCreditError(axiosError(402, "Something else"))).toBeNull();
    expect(getCreditError(new Error("network"))).toBeNull();
  });
});
