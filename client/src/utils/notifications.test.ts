import { Bell, ShoppingBag } from "lucide-react";
import {
  NOTIFICATION_META,
  formatRelativeTime,
  getNotificationGroup,
  getNotificationLink,
  getNotificationMeta,
  getNotificationText,
} from "./notifications.js";
import i18n from "../i18n/config.js";
import { makeNotification, t } from "../test/utils.js";
import type { Notification } from "../context/NotificationsContext.js";

describe("getNotificationMeta", () => {
  it("returns the icon for the notification type", () => {
    expect(getNotificationMeta(makeNotification()).icon).toBe(ShoppingBag);
  });

  it("falls back to the bell for untyped notifications", () => {
    expect(getNotificationMeta(makeNotification({ type: null })).icon).toBe(Bell);
  });

  it("has a translation for every notification type in both languages", () => {
    for (const type of Object.keys(NOTIFICATION_META)) {
      for (const lng of ["bs", "en"]) {
        expect(i18n.exists(`notifications.types.${type}`, { lng }), `${lng}: ${type}`).toBe(true);
      }
    }
  });
});

describe("getNotificationLink", () => {
  it("links to the reservation first, then the product", () => {
    expect(getNotificationLink(makeNotification({ reservation_id: 5, product_id: 9 }), "STORE")).toBe("/reservation/5");
    expect(getNotificationLink(makeNotification({ reservation_id: null, product_id: 9 }), "STORE")).toBe("/products/9");
  });

  it("falls back to the role's reservation list", () => {
    const bare = makeNotification({ reservation_id: null, product_id: null });
    expect(getNotificationLink(bare, "STORE")).toBe("/reservations");
    expect(getNotificationLink(bare, "RESTAURANT")).toBe("/my-reservations");
    expect(getNotificationLink(bare, undefined)).toBe("/my-reservations");
  });

  it("sends a donation notification to the donations page", () => {
    const removed = makeNotification({ type: "DONATION_REMOVED_BY_ADMIN", reservation_id: null, product_id: null, donation_id: 7 });
    expect(getNotificationLink(removed, "RESTAURANT")).toBe("/donate-food");
  });

  it("sends credit request notifications to the admin requests page or the Credits page", () => {
    const base = { reservation_id: null, product_id: null, credit_request_id: 4 };
    expect(getNotificationLink(makeNotification({ ...base, type: "CREDIT_REQUEST_CREATED" }), "ADMIN")).toBe(
      "/admin/credit-requests",
    );
    expect(getNotificationLink(makeNotification({ ...base, type: "CREDIT_REQUEST_APPROVED" }), "STORE")).toBe("/credits");
    expect(getNotificationLink(makeNotification({ ...base, type: "CREDIT_REQUEST_REJECTED" }), "STORE")).toBe("/credits");
  });

  it("sends renewal and expiry notices to the matching My profile section", () => {
    const base = { reservation_id: null, product_id: null, credit_request_id: 4 };
    const link = (overrides: Partial<Notification>) => getNotificationLink(makeNotification({ ...base, ...overrides }), "STORE");
    expect(link({ type: "CREDIT_RENEWAL_CREATED", credit_request_type: "SUBSCRIPTION" })).toBe("/my-profile#subscription");
    expect(link({ type: "CREDIT_REQUEST_EXPIRED", credit_request_type: "SUBSCRIPTION" })).toBe("/my-profile#subscription");
    expect(link({ type: "CREDIT_REQUEST_EXPIRED", credit_request_type: "TOPUP" })).toBe("/my-profile#topup");
    expect(link({ type: "CREDIT_RENEWAL_SKIPPED", credit_request_id: null })).toBe("/my-profile#subscription");
  });
});

describe("getNotificationText", () => {
  it("translates by type with the product, quantity and unit", async () => {
    await i18n.changeLanguage("en");
    const text = getNotificationText(makeNotification({ quantity: "2.50" }), t);
    expect(text).toContain("Piletina");
    expect(text).toContain("2.5");
    expect(text).not.toBe(makeNotification().message);
  });

  it("adds the admin's reason after the translated text", () => {
    const removed = makeNotification({ type: "PRODUCT_REMOVED_BY_ADMIN", reservation_id: null, details: "Neispravan opis" });
    expect(getNotificationText(removed, t)).toBe(
      `${t("notifications.types.PRODUCT_REMOVED_BY_ADMIN", { product: "Piletina" })} ${t("notifications.reason", { reason: "Neispravan opis" })}`,
    );
  });

  it("describes credit requests by request type, credits and requester", () => {
    const created = makeNotification({
      type: "CREDIT_REQUEST_CREATED",
      product_name: null,
      credit_request_type: "TOPUP",
      credit_amount: 20,
      credit_requester: "Market Centar",
    });
    expect(getNotificationText(created, t)).toBe(
      t("notifications.credits.topupCreated", { credits: 20, requester: "Market Centar" }),
    );
    const approved = makeNotification({
      type: "CREDIT_REQUEST_APPROVED",
      product_name: null,
      credit_request_type: "SUBSCRIPTION",
      credit_amount: 50,
    });
    expect(getNotificationText(approved, t)).toBe(t("notifications.credits.subscriptionApproved", { credits: 50 }));
    // The request is gone: the type's generic text.
    const orphan = makeNotification({ type: "CREDIT_REQUEST_REJECTED", product_name: null, credit_request_type: null });
    expect(getNotificationText(orphan, t)).toBe(t("notifications.types.CREDIT_REQUEST_REJECTED"));
  });

  it("describes renewals, expired requests and a renewal that could not be created", () => {
    const credit = { product_name: null, reservation_id: null, product_id: null };
    const renewal = makeNotification({ ...credit, type: "CREDIT_RENEWAL_CREATED", credit_request_type: "SUBSCRIPTION", credit_amount: 50 });
    expect(getNotificationText(renewal, t)).toBe(t("notifications.credits.renewalCreated", { credits: 50 }));
    const expired = makeNotification({ ...credit, type: "CREDIT_REQUEST_EXPIRED", credit_request_type: "TOPUP", credit_amount: 20 });
    expect(getNotificationText(expired, t)).toBe(t("notifications.credits.topupExpired"));
    const skipped = makeNotification({ ...credit, type: "CREDIT_RENEWAL_SKIPPED", message: "English fallback" });
    expect(getNotificationText(skipped, t)).toBe(t("notifications.types.CREDIT_RENEWAL_SKIPPED"));
  });

  it("returns the stored message for untyped notifications or without a product", () => {
    expect(getNotificationText(makeNotification({ type: null, message: "Stara poruka" }), t)).toBe("Stara poruka");
    expect(getNotificationText(makeNotification({ product_name: null, message: "Bez proizvoda" }), t)).toBe(
      "Bez proizvoda",
    );
  });
});

describe("formatRelativeTime", () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const MINUTE = 60_000;

  it.each([
    [10_000, "notifications.time.justNow", undefined],
    [5 * MINUTE, "notifications.time.minutesAgo", 5],
    [3 * 60 * MINUTE, "notifications.time.hoursAgo", 3],
    [2 * 24 * 60 * MINUTE, "notifications.time.daysAgo", 2],
  ])("formats %i ms ago", (ms, key, count) => {
    expect(formatRelativeTime(ago(ms), t, "bs")).toBe(t(key, { count }));
  });

  it("shows the date for anything older than a week", () => {
    const date = ago(10 * 24 * 60 * MINUTE);
    expect(formatRelativeTime(date, t, "en")).toBe(
      new Date(date).toLocaleDateString("en", { day: "numeric", month: "numeric", year: "numeric" }),
    );
  });

  it("treats future timestamps (clock skew) as just now", () => {
    expect(formatRelativeTime(new Date(Date.now() + MINUTE).toISOString(), t, "bs")).toBe(
      t("notifications.time.justNow"),
    );
  });
});

describe("getNotificationGroup", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 9, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups by today, yesterday and earlier using local midnight", () => {
    expect(getNotificationGroup(new Date(2026, 9, 20, 0, 1).toISOString())).toBe("today");
    expect(getNotificationGroup(new Date(2026, 9, 19, 23, 59).toISOString())).toBe("yesterday");
    expect(getNotificationGroup(new Date(2026, 9, 19, 0, 0).toISOString())).toBe("yesterday");
    expect(getNotificationGroup(new Date(2026, 9, 18, 23, 59).toISOString())).toBe("earlier");
  });
});

describe("branch notifications", () => {
  const branchNotification = (overrides: Partial<Notification> = {}) =>
    makeNotification({
      type: "BRANCH_BLOCKED",
      reservation_id: null,
      product_id: null,
      product_name: null,
      branch_id: 21,
      branch_name: "Bingo Visoko",
      details: "Kršenje pravila",
      ...overrides,
    });

  it("opens the branch page for its headquarters", () => {
    expect(getNotificationLink(branchNotification(), "COMPANY")).toBe("/company/branches/21");
  });

  it("names the branch and adds the reason", () => {
    const blocked = t("notifications.types.BRANCH_BLOCKED", { branch: "Bingo Visoko" });
    const reason = t("notifications.reason", { reason: "Kršenje pravila" });
    expect(getNotificationText(branchNotification(), t)).toBe(blocked + " " + reason);
    expect(getNotificationText(branchNotification({ type: "BRANCH_REACTIVATED", details: null }), t)).toBe(
      t("notifications.types.BRANCH_REACTIVATED", { branch: "Bingo Visoko" }),
    );
  });
});
