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
});

describe("getNotificationText", () => {
  it("translates by type with the product, quantity and unit", async () => {
    await i18n.changeLanguage("en");
    const text = getNotificationText(makeNotification({ quantity: "2.50" }), t);
    expect(text).toContain("Piletina");
    expect(text).toContain("2.5");
    expect(text).not.toBe(makeNotification().message);
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
