import { formatPickup, formatQuantity, unitLabel } from "../src/email/templates/format.js";
import { emailTemplate, EMAIL_TEMPLATES } from "../src/email/templates/index.js";
import { escapeHtml, renderLayout } from "../src/email/templates/layout.js";
import type { NotificationEmailData } from "../src/email/templates/notificationData.js";
import { NOTIFICATION_TEMPLATES, notificationLink } from "../src/email/templates/notificationEmails.js";
import { InvalidEmailDataError } from "../src/email/templates/types.js";
import type { NotificationType } from "../src/utils/notifications.js";

const APP_URL = "https://app.example.com";

// Nothing linked; each case fills in what its notification links to.
const EMPTY: NotificationEmailData = {
  recipientRole: "STORE",
  reservationId: null,
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

// A store's new reservation.
const DATA: NotificationEmailData = {
  ...EMPTY,
  reservationId: 42,
  productId: 7,
  productName: "Piletina <svježa>",
  quantity: "2.50",
  unit: "kg",
  restaurantName: "Restoran Ćevap & Co",
  storeName: "Market Centar",
  pickupAt: "2026-11-06T14:30",
};

const reservationCreated = NOTIFICATION_TEMPLATES.RESERVATION_CREATED;

describe("RESERVATION_CREATED email", () => {
  it("is in Bosnian", () => {
    const email = reservationCreated.render(DATA, "bs", APP_URL);
    expect(email.subject).toBe("Nova rezervacija: 2,5 kg Piletina <svježa>");

    expect(email.html).toContain('<html lang="bs">');
    expect(email.html).toContain(">FoodWise<");
    expect(email.html).toContain("Nova rezervacija</h1>");
    expect(email.html).toContain("Imate novi zahtjev za rezervaciju.");
    expect(email.html).toContain("Količina");
    expect(email.html).toContain("06.11.2026. 14:30");
    expect(email.html).toContain(`href="${APP_URL}/reservation/42"`);
    expect(email.html).toContain(">Otvori rezervaciju</a>");
    expect(email.html).toContain("Ovu poruku ste dobili jer imate račun na platformi FoodWise.");

    expect(email.text).toContain("Nova rezervacija");
    expect(email.text).toContain("Proizvod: Piletina <svježa>");
    expect(email.text).toContain("Količina: 2,5 kg");
    expect(email.text).toContain("Restoran: Restoran Ćevap & Co");
    expect(email.text).toContain("Preuzimanje: 06.11.2026. 14:30");
    expect(email.text).toContain(`Otvori rezervaciju: ${APP_URL}/reservation/42`);
    expect(email.text).toContain("Ovu poruku ste dobili jer imate račun na platformi FoodWise.");
    expect(email.text).not.toContain("<p");
  });

  it("is in English", () => {
    const email = reservationCreated.render({ ...DATA, unit: "kom", quantity: "3.00" }, "en", APP_URL);
    expect(email.subject).toBe("New reservation: 3 pcs Piletina <svježa>");
    expect(email.html).toContain('<html lang="en">');
    expect(email.html).toContain("You have a new reservation request.");
    expect(email.html).toContain(">Open reservation</a>");
    expect(email.html).toContain("06/11/2026 14:30");
    expect(email.html).toContain("You received this email because you have a FoodWise account.");
    expect(email.text).toContain("Quantity: 3 pcs");
    expect(email.text).toContain("Restaurant: Restoran Ćevap & Co");
    expect(email.text).toContain("Pickup: 06/11/2026 14:30");
    expect(email.text).toContain(`Open reservation: ${APP_URL}/reservation/42`);
    expect(email.text).not.toContain("Nova rezervacija");
  });

  it("escapes names in the HTML", () => {
    const email = reservationCreated.render(
      { ...DATA, productName: '<script>alert("x")</script>', restaurantName: "<b>R</b>" },
      "bs",
      APP_URL,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(email.html).toContain("&lt;b&gt;R&lt;/b&gt;");
    expect(reservationCreated.render(DATA, "bs", APP_URL).html).toContain("Restoran Ćevap &amp; Co");
  });

  it("leaves out the restaurant row when it has no business name", () => {
    expect(reservationCreated.render({ ...DATA, restaurantName: null }, "bs", APP_URL).text).not.toContain("Restoran:");
  });

  it("refuses stored data that does not fit", () => {
    expect(() => reservationCreated.render({ ...DATA, reservationId: "42" }, "bs", APP_URL)).toThrow(InvalidEmailDataError);
    expect(() => reservationCreated.render({ ...DATA, recipientRole: undefined }, "bs", APP_URL)).toThrow(
      InvalidEmailDataError,
    );
    expect(() => reservationCreated.render(null, "bs", APP_URL)).toThrow(
      "The stored data does not match the RESERVATION_CREATED email template.",
    );
  });

  it("is listed under its notification type", () => {
    expect(emailTemplate("RESERVATION_CREATED")).toBe(reservationCreated);
    expect(emailTemplate("NO_SUCH_TEMPLATE")).toBeUndefined();
    expect(emailTemplate("toString")).toBeUndefined();
    expect(Object.keys(EMAIL_TEMPLATES)).toHaveLength(32);
  });
});


// Data for every type, as the queue would store it: a store's reservation, a donation, credit
// requests, a branch and an announcement.
const FULL: Record<NotificationType, NotificationEmailData> = (() => {
  const reservation = { ...DATA, recipientRole: "RESTAURANT" };
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
    RESERVATION_CREATED: DATA,
    RESERVATION_ACCEPTED: reservation,
    RESERVATION_REJECTED: reservation,
    RESERVATION_CANCELLED: DATA,
    RESERVATION_EXPIRED: reservation,
    PRODUCT_EXPIRED: product,
    PRODUCT_SOLD_OUT: product,
    PRODUCT_EXPIRING_SOON: product,
    PICKUP_TODAY: reservation,
    RESERVATION_COMPLETED: reservation,
    PICKUP_MISSED: reservation,
    PRODUCT_REMOVED_BY_ADMIN: { ...product, details: "Neispravan opis" },
    DONATION_REMOVED_BY_ADMIN: { ...EMPTY, donationId: 5, productName: "Hljeb", unit: "kom", details: "Duplikat" },
    RESERVATION_CANCELLED_BY_ADMIN: { ...reservation, details: "Spor" },
    RESERVATION_CANCELLED_STORE_CLOSED: reservation,
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
    const accepted = NOTIFICATION_TEMPLATES.RESERVATION_ACCEPTED.render(FULL.RESERVATION_ACCEPTED, "bs", APP_URL);
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
    expect(link("RESERVATION_CREATED")).toBe("/reservation/42");
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
