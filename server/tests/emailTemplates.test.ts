import { formatPickup, formatQuantity, unitLabel } from "../src/email/templates/format.js";
import { emailTemplate, EMAIL_TEMPLATES } from "../src/email/templates/index.js";
import { escapeHtml, renderLayout } from "../src/email/templates/layout.js";
import type { NotificationEmailData, OrderLineData } from "../src/email/templates/notificationData.js";
import { NOTIFICATION_TEMPLATES, notificationLink } from "../src/email/templates/notificationEmails.js";
import { InvalidEmailDataError } from "../src/email/templates/types.js";
import type { NotificationType } from "../src/utils/notifications.js";

const APP_URL = "https://app.example.com";

// Nothing linked; each case fills in what its notification links to.
const EMPTY: NotificationEmailData = {
  recipientRole: "STORE",
  reservationId: null,
  orderId: null,
  productId: null,
  donationId: null,
  creditRequestId: null,
  branchId: null,
  announcementId: null,
  productName: null,
  unit: null,
  quantity: null,
  pickupAt: null,
  restaurantName: null,
  storeName: null,
  orderCode: null,
  orderLines: null,
  details: null,
  announcementTitleBs: null,
  announcementBodyBs: null,
  announcementTitleEn: null,
  announcementBodyEn: null,
  creditRequestType: null,
  credits: null,
  creditRequester: null,
  creditCompany: null,
  branchName: null,
};

const line = (overrides: Partial<OrderLineData> = {}): OrderLineData => ({
  product: "Piletina <svježa>",
  unit: "kg",
  ordered: "2.50",
  quantity: "2.50",
  unitPrice: "4.00",
  status: "Pending",
  reason: null,
  note: null,
  ...overrides,
});

// A store's new order with two lines.
const DATA: NotificationEmailData = {
  ...EMPTY,
  orderId: 42,
  orderCode: "K7PM",
  orderLines: [line(), line({ product: "Hljeb", unit: "kom", ordered: "3.00", quantity: "3.00", unitPrice: "1.50" })],
  restaurantName: "Restoran Ćevap & Co",
  storeName: "Market Centar",
  pickupAt: "2026-11-06T14:30",
};

const orderCreated = NOTIFICATION_TEMPLATES.ORDER_CREATED;

describe("ORDER_CREATED email", () => {
  it("is in Bosnian", () => {
    const email = orderCreated.render(DATA, "bs", APP_URL);
    expect(email.subject).toBe("Nova narudžba #K7PM od Restoran Ćevap & Co");

    expect(email.html).toContain('<html lang="bs">');
    expect(email.html).toContain(">FoodWise<");
    expect(email.html).toContain("Nova narudžba #K7PM</h1>");
    expect(email.html).toContain("Restoran Ćevap &amp; Co je poslao narudžbu #K7PM.");
    expect(email.html).toContain("06.11.2026. 14:30");
    // Until the order details page exists (orders PR 3b), the store's list.
    expect(email.html).toContain(`href="${APP_URL}/reservations"`);
    expect(email.html).toContain("Ovu poruku ste dobili jer imate račun na platformi FoodWise.");

    expect(email.text).toContain("Narudžba: #K7PM");
    expect(email.text).toContain("Restoran: Restoran Ćevap & Co");
    expect(email.text).toContain("Preuzimanje: 06.11.2026. 14:30");
    expect(email.text).toContain("- Piletina <svježa>, 2,5 kg: 10,00 KM");
    expect(email.text).toContain("- Hljeb, 3 kom: 4,50 KM");
    expect(email.text).toContain("Ukupno: 14,50 KM");
    expect(email.text).not.toContain("<p");
  });

  it("is in English", () => {
    const email = orderCreated.render(DATA, "en", APP_URL);
    expect(email.subject).toBe("New order #K7PM from Restoran Ćevap & Co");
    expect(email.html).toContain('<html lang="en">');
    expect(email.html).toContain("06/11/2026 14:30");
    expect(email.text).toContain("Order: #K7PM");
    expect(email.text).toContain("- Hljeb, 3 pcs: 4.50 KM");
    expect(email.text).toContain("Total: 14.50 KM");
    expect(email.text).not.toContain("Nova narudžba");
  });

  it("escapes names in the HTML", () => {
    const email = orderCreated.render(
      { ...DATA, orderLines: [line({ product: '<script>alert("x")</script>' })], restaurantName: "<b>R</b>" },
      "bs",
      APP_URL,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(email.html).toContain("&lt;b&gt;R&lt;/b&gt;");
  });

  it("leaves out the restaurant row when it has no business name", () => {
    expect(orderCreated.render({ ...DATA, restaurantName: null }, "bs", APP_URL).text).not.toContain("Restoran:");
  });

  it("refuses stored data that does not fit", () => {
    expect(() => orderCreated.render({ ...DATA, orderId: "42" }, "bs", APP_URL)).toThrow(InvalidEmailDataError);
    expect(() => orderCreated.render({ ...DATA, orderLines: [{ product: "X" }] }, "bs", APP_URL)).toThrow(
      InvalidEmailDataError,
    );
    expect(() => orderCreated.render({ ...DATA, recipientRole: undefined }, "bs", APP_URL)).toThrow(InvalidEmailDataError);
    expect(() => orderCreated.render(null, "bs", APP_URL)).toThrow(
      "The stored data does not match the ORDER_CREATED email template.",
    );
  });

  it("reads data queued before orders existed (no order keys) as without an order", () => {
    const { orderId: _id, orderCode: _code, orderLines: _lines, ...old } = { ...DATA, orderId: null };
    const email = NOTIFICATION_TEMPLATES.PRODUCT_SOLD_OUT.render({ ...old, productId: 7, productName: "Jogurt" }, "bs", APP_URL);
    expect(email.text).toContain("Jogurt");
  });

  it("is listed under its notification type", () => {
    expect(emailTemplate("ORDER_CREATED")).toBe(orderCreated);
    expect(emailTemplate("NO_SUCH_TEMPLATE")).toBeUndefined();
    expect(emailTemplate("toString")).toBeUndefined();
    // 36 notification types and the system emails PASSWORD_RESET and INVITATION.
    expect(Object.keys(EMAIL_TEMPLATES)).toHaveLength(38);
  });
});

describe("the store's decision in the email", () => {
  const decided = (lines: OrderLineData[]) => ({ ...DATA, recipientRole: "RESTAURANT", orderLines: lines });

  it("lists each change with its reason and the new total", () => {
    const email = NOTIFICATION_TEMPLATES.ORDER_PARTIALLY_ACCEPTED.render(
      decided([
        line({ ordered: "20.00", quantity: "15.00", unitPrice: "3.50", status: "Confirmed", reason: "NOT_ENOUGH_STOCK" }),
        line({ product: "Mlijeko", unit: "l", ordered: "5.00", quantity: "5.00", unitPrice: "1.00", status: "Rejected", reason: "QUALITY" }),
        line({ product: "Sir", unit: "kg", ordered: "1.00", quantity: "1.00", unitPrice: "9.00", status: "Rejected", reason: "OTHER", note: "Ambalaža oštećena" }),
      ]),
      "bs",
      APP_URL,
    );
    expect(email.subject).toBe("Narudžba #K7PM je djelimično prihvaćena");
    expect(email.text).toContain("Novi iznos: 52,50 KM umjesto 84,00 KM.");
    expect(email.text).toContain("- Piletina <svježa>, 15 kg: 52,50 KM");
    expect(email.text).toContain("  15 kg od 20 kg · nema dovoljno na stanju");
    expect(email.text).toContain("- [Mlijeko, 5 l]: 5,00 KM");
    expect(email.text).toContain("  Odbijeno · kvalitet");
    expect(email.text).toContain("  Odbijeno · Ambalaža oštećena");
    expect(email.text).toContain("Ukupno: 52,50 KM");
    expect(email.html).toContain("text-decoration:line-through");
    expect(email.text).toContain(`${APP_URL}/my-reservations`);
  });

  it("has no total when the store rejected everything", () => {
    const email = NOTIFICATION_TEMPLATES.ORDER_REJECTED.render(
      decided([line({ status: "Rejected", reason: "QUALITY" })]),
      "en",
      APP_URL,
    );
    expect(email.subject).toBe("Order #K7PM was rejected");
    expect(email.text).toContain("Rejected · quality");
    expect(email.text).not.toContain("Total:");
  });
});


// Data for every type, as the queue would store it: an order, a donation, credit
// requests, a branch and an announcement.
const FULL: Record<NotificationType, NotificationEmailData> = (() => {
  const order = { ...DATA, recipientRole: "RESTAURANT" };
  const product = { ...EMPTY, productId: 7, productName: "Jogurt", unit: "kom" };
  const credit = {
    ...EMPTY,
    recipientRole: "RESTAURANT",
    creditRequestId: 3,
    creditRequestType: "TOPUP" as const,
    credits: 20,
    creditRequester: "Bistro",
  };
  const branchCredit = {
    ...credit,
    recipientRole: "COMPANY",
    branchId: 9,
    branchName: "Bingo Tuzla",
    creditRequester: "Bingo Tuzla",
    creditCompany: "Bingo d.o.o.",
  };
  const branch = { ...EMPTY, recipientRole: "COMPANY", branchId: 9, branchName: "Bingo Tuzla", details: "Kasni" };
  return {
    ORDER_CREATED: DATA,
    ORDER_CANCELLED: DATA,
    ORDER_ACCEPTED: order,
    ORDER_PARTIALLY_ACCEPTED: order,
    ORDER_REJECTED: order,
    ORDER_COMPLETED: order,
    ORDER_PICKUP_MISSED: order,
    ORDER_PICKUP_TODAY: order,
    ORDER_ITEMS_EXPIRED: order,
    ORDER_EXPIRED: order,
    ORDER_ITEMS_REMOVED: order,
    ORDER_CANCELLED_BY_ADMIN: { ...order, details: "Spor" },
    ORDER_CANCELLED_STORE_CLOSED: order,
    PRODUCT_EXPIRED: product,
    PRODUCT_SOLD_OUT: product,
    PRODUCT_EXPIRING_SOON: product,
    PRODUCT_REMOVED_BY_ADMIN: { ...product, details: "Neispravan opis" },
    DONATION_REMOVED_BY_ADMIN: { ...EMPTY, donationId: 5, productName: "Hljeb", unit: "kom", details: "Duplikat" },
    BRANCH_BLOCKED: branch,
    BRANCH_UNBLOCKED: branch,
    BRANCH_DEACTIVATED: branch,
    BRANCH_REACTIVATED: branch,
    PLATFORM_ANNOUNCEMENT: {
      ...EMPTY,
      announcementId: 1,
      announcementTitleBs: "Novi rok",
      announcementBodyBs: "Preuzimanje do 20h.",
      announcementTitleEn: "New deadline",
      announcementBodyEn: "Pickups until 8pm.",
    },
    CREDIT_REQUEST_CREATED: { ...credit, recipientRole: "ADMIN" },
    CREDIT_REQUEST_APPROVED: credit,
    CREDIT_REQUEST_REJECTED: credit,
    CREDIT_RENEWAL_CREATED: { ...credit, creditRequestType: "SUBSCRIPTION", credits: 50 },
    CREDIT_REQUEST_EXPIRED: credit,
    CREDIT_RENEWAL_SKIPPED: { ...EMPTY, recipientRole: "RESTAURANT" },
    BRANCH_TOPUP_REQUESTED: branchCredit,
    BRANCH_CREDIT_REQUEST_APPROVED: branchCredit,
    BRANCH_CREDIT_REQUEST_REJECTED: branchCredit,
    BRANCH_CREDIT_REQUEST_EXPIRED: branchCredit,
    CREDIT_TOPUP_COMPANY_APPROVED: { ...credit, recipientRole: "STORE" },
    CREDIT_TOPUP_COMPANY_REJECTED: { ...credit, recipientRole: "STORE", details: "Nema budžeta" },
    PASSWORD_CHANGED: { ...EMPTY, recipientRole: "RESTAURANT" },
  };
})();

describe("every notification email", () => {
  it.each(Object.keys(FULL) as NotificationType[])("%s renders in Bosnian and English", (type) => {
    const template = NOTIFICATION_TEMPLATES[type];
    const bs = template.render(FULL[type], "bs", APP_URL);
    const en = template.render(FULL[type], "en", APP_URL);
    for (const email of [bs, en]) {
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.html).toContain(`href="${APP_URL}/`);
      expect(email.text).toContain(`${APP_URL}/`);
      // No unfilled values.
      expect(email.text).not.toMatch(/undefined|null|\{\{/);
    }
    expect(bs.subject).not.toBe(en.subject);
    expect(bs.html).toContain('<html lang="bs">');
    expect(en.html).toContain('<html lang="en">');
  });

  it("words subscriptions and top-ups differently", () => {
    const approved = NOTIFICATION_TEMPLATES.CREDIT_REQUEST_APPROVED;
    expect(approved.render(FULL.CREDIT_REQUEST_APPROVED, "bs", APP_URL).text).toContain(
      "Dodatni krediti (20) su odobreni i dodani ovom mjesecu.",
    );
    const subscription = { ...FULL.CREDIT_REQUEST_APPROVED, creditRequestType: "SUBSCRIPTION" as const, credits: 50 };
    expect(approved.render(subscription, "en", APP_URL).text).toContain("Your subscription (50 credits) was approved.");
  });

  it("shows the reason or note, the other party and the requester", () => {
    const removed = NOTIFICATION_TEMPLATES.PRODUCT_REMOVED_BY_ADMIN.render(FULL.PRODUCT_REMOVED_BY_ADMIN, "bs", APP_URL);
    expect(removed.text).toContain("Razlog: Neispravan opis");
    const note = NOTIFICATION_TEMPLATES.CREDIT_TOPUP_COMPANY_REJECTED.render(
      FULL.CREDIT_TOPUP_COMPANY_REJECTED,
      "en",
      APP_URL,
    );
    expect(note.text).toContain("Headquarters' note: Nema budžeta");
    const accepted = NOTIFICATION_TEMPLATES.ORDER_ACCEPTED.render(FULL.ORDER_ACCEPTED, "bs", APP_URL);
    expect(accepted.text).toContain("Prodavnica: Market Centar");
    expect(accepted.text).not.toContain("Restoran: ");
    const created = NOTIFICATION_TEMPLATES.CREDIT_REQUEST_CREATED.render(
      { ...FULL.CREDIT_REQUEST_CREATED, creditCompany: "Bingo d.o.o." },
      "bs",
      APP_URL,
    );
    expect(created.text).toContain("Podnosilac: Bingo d.o.o. → Bistro");
  });

  it("uses the English announcement when there is one, else the Bosnian", () => {
    const template = NOTIFICATION_TEMPLATES.PLATFORM_ANNOUNCEMENT;
    expect(template.render(FULL.PLATFORM_ANNOUNCEMENT, "en", APP_URL).text).toContain("Pickups until 8pm.");
    const bosnianOnly = { ...FULL.PLATFORM_ANNOUNCEMENT, announcementTitleEn: null, announcementBodyEn: null };
    const email = template.render(bosnianOnly, "en", APP_URL);
    expect(email.subject).toBe("Platform announcement: Novi rok");
    expect(email.text).toContain("Preuzimanje do 20h.");
  });

  it("links like the notification does in the app", () => {
    const link = (type: NotificationType, data: Partial<NotificationEmailData> = {}) =>
      notificationLink(type, { ...FULL[type], ...data }).path;
    // Orders open the role's list until the order details page exists (orders PR 3b).
    expect(link("ORDER_CREATED")).toBe("/reservations");
    expect(link("ORDER_ACCEPTED")).toBe("/my-reservations");
    expect(link("PRODUCT_EXPIRED")).toBe("/products/7");
    expect(link("DONATION_REMOVED_BY_ADMIN")).toBe("/donate-food");
    expect(link("PLATFORM_ANNOUNCEMENT")).toBe("/dashboard");
    expect(link("CREDIT_REQUEST_CREATED")).toBe("/admin/credit-requests");
    expect(link("CREDIT_REQUEST_APPROVED")).toBe("/credits");
    expect(link("CREDIT_REQUEST_EXPIRED")).toBe("/my-profile#topup");
    expect(link("CREDIT_REQUEST_EXPIRED", { creditRequestType: "SUBSCRIPTION" })).toBe("/my-profile#subscription");
    expect(link("CREDIT_RENEWAL_SKIPPED")).toBe("/my-profile#subscription");
    expect(link("CREDIT_TOPUP_COMPANY_REJECTED")).toBe("/my-profile#topup");
    expect(link("BRANCH_TOPUP_REQUESTED")).toBe("/company/credits");
    expect(link("BRANCH_BLOCKED")).toBe("/company/branches/9");
    expect(link("BRANCH_CREDIT_REQUEST_APPROVED")).toBe("/company/branches/9");
  });
});

describe("layout", () => {
  it("leaves out the details table and keeps the button without details", () => {
    const email = renderLayout({
      lang: "en",
      subject: "Subject",
      heading: "Heading",
      intro: ["First", "Second"],
      button: { label: "Open", url: "https://app.example.com/x?a=1&b=2" },
    });
    expect(email.subject).toBe("Subject");
    expect(email.html).toContain('href="https://app.example.com/x?a=1&amp;b=2"');
    expect(email.html).not.toContain("white-space:nowrap");
    expect(email.text).toBe(
      [
        "FoodWise",
        "",
        "Heading",
        "",
        "First",
        "",
        "Second",
        "",
        "Open: https://app.example.com/x?a=1&b=2",
        "",
        "--",
        "You received this email because you have a FoodWise account.",
        "FoodWise – Još vrijedi",
        "",
      ].join("\n"),
    );
  });

  it("escapes every HTML special character", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("format", () => {
  it("formats quantities per language", () => {
    expect(formatQuantity("4.00", "bs")).toBe("4");
    expect(formatQuantity("2.50", "bs")).toBe("2,5");
    expect(formatQuantity("2.50", "en")).toBe("2.5");
    expect(formatQuantity("abc", "en")).toBe("abc");
  });

  it("names units per language", () => {
    expect(unitLabel("kom", "bs")).toBe("kom");
    expect(unitLabel("kom", "en")).toBe("pcs");
    expect(unitLabel("pak", "en")).toBe("pk");
    expect(unitLabel("kg", "en")).toBe("kg");
    expect(unitLabel("box", "en")).toBe("box");
  });

  it("formats the pickup and leaves out midnight", () => {
    expect(formatPickup("2026-11-06T09:05", "bs")).toBe("06.11.2026. 09:05");
    expect(formatPickup("2026-11-06T09:05", "en")).toBe("06/11/2026 09:05");
    expect(formatPickup("2026-11-06T00:00", "bs")).toBe("06.11.2026.");
    expect(formatPickup("2026-11-06", "en")).toBe("06/11/2026");
    expect(formatPickup("soon", "en")).toBe("soon");
  });
});
