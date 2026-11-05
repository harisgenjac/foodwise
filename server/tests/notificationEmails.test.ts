import pool from "../src/config/db.js";
import { emailTemplate } from "../src/email/templates/index.js";
import { NOTIFICATION_TEMPLATES } from "../src/email/templates/notificationEmails.js";
import { expireProducts } from "../src/jobs/expireProducts.js";
import { sendReminders } from "../src/jobs/notificationReminders.js";
import {
  createNotification,
  notifyAdminsOfCreditRequest,
  notifyCompanyHq,
  notifyCompanyHqOfCredit,
  type NotificationType,
} from "../src/utils/notifications.js";
import {
  cleanupCompanies,
  cleanupUsers,
  createDonation,
  createProduct,
  futureDate,
  insertCompany,
  insertUser,
  login,
  registerAndLogin,
  reserve,
  userId,
  type Agent,
} from "./helpers.js";

// Every notification queues its email: each type through createNotification, and every bulk path
// (announcements, admins, headquarters, the reminder and expiry jobs) through its real code.

const STORE = "notification-emails-store@test.com";
const RESTAURANT = "notification-emails-restaurant@test.com";
const ADMIN = "notification-emails-admin@test.com";
const HQ = "notification-emails-hq@test.com";
const BRANCH = "notification-emails-branch@test.com";
const BLOCKED = "notification-emails-blocked@test.com";
const COMPANY = "Notification Emails d.o.o.";
const EMAILS = [STORE, RESTAURANT, ADMIN, HQ, BRANCH, BLOCKED];
const APP_URL = "https://app.example.com";

interface QueueRow {
  user_id: number;
  recipient: string;
  template: string;
  data: Record<string, unknown>;
  language: string;
}

const emailsTo = async (email: string): Promise<QueueRow[]> =>
  (
    await pool.query<QueueRow>(
      "SELECT user_id, recipient, template, data, language FROM email_queue WHERE recipient = $1 ORDER BY id",
      [email],
    )
  ).rows;

// Both languages render without an error; returns them.
const renderBoth = (row: QueueRow) => {
  const template = emailTemplate(row.template)!;
  return { bs: template.render(row.data, "bs", APP_URL), en: template.render(row.data, "en", APP_URL) };
};

// The NotificationType union as declared in src/utils/notifications.ts.
const declaredTypes = async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../src/utils/notifications.ts", import.meta.url), "utf8");
  const union = source.slice(source.indexOf("export type NotificationType"), source.indexOf(";", source.indexOf("export type NotificationType")));
  return [...union.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]!).sort();
};

let store: Agent;
let restaurant: Agent;
let admin: Agent;
let companyId: number;

beforeEach(async () => {
  await pool.query("DELETE FROM email_queue");
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  admin = await registerAndLogin(ADMIN, "ADMIN");
  companyId = await insertCompany(COMPANY);
  await insertUser(HQ, "COMPANY", null, null, companyId);
  await insertUser(BRANCH, "STORE", "Poslovnica Visoko", 1000, companyId);
});

afterEach(async () => {
  await cleanupUsers(EMAILS);
  await cleanupCompanies([COMPANY]);
});

it("every declared notification type has an email template", async () => {
  expect(Object.keys(NOTIFICATION_TEMPLATES).sort()).toEqual(await declaredTypes());
  expect(Object.keys(NOTIFICATION_TEMPLATES)).toHaveLength(33);
});

it("createNotification queues the email of every type, and each renders in both languages", async () => {
  const product = await createProduct(store, { name: "Jogurt", unit: "kom", quantity: 10 });
  const reservationId = await reserve(restaurant, product.id, 2);
  const donation = await createDonation(store, { name: "Hljeb" });
  const restaurantId = await userId(RESTAURANT);
  const branchId = await userId(BRANCH);
  const topup = await pool.query<{ id: number }>(
    `INSERT INTO credit_requests (user_id, request_type, topup_package_id, period_month)
     SELECT $1, 'TOPUP', topup_packages.id, date_trunc('month', CURRENT_DATE)::date
     FROM topup_packages WHERE topup_packages.credits = 20
     RETURNING id`,
    [branchId],
  );
  const requestId = topup.rows[0]!.id;
  await pool.query("DELETE FROM email_queue");

  const links: Record<string, Record<string, number>> = {
    reservation: { reservationId, productId: product.id },
    product: { productId: product.id },
    donation: { donationId: donation.id },
    credit: { creditRequestId: requestId },
    branch: { branchId },
    branchCredit: { creditRequestId: requestId, branchId },
    none: {},
  };
  // Who gets each type and what it links to, as the app sends it.
  const cases: Record<NotificationType, [string, keyof typeof links]> = {
    RESERVATION_CREATED: [STORE, "reservation"],
    RESERVATION_ACCEPTED: [RESTAURANT, "reservation"],
    RESERVATION_REJECTED: [RESTAURANT, "reservation"],
    RESERVATION_CANCELLED: [STORE, "reservation"],
    RESERVATION_EXPIRED: [RESTAURANT, "reservation"],
    PRODUCT_EXPIRED: [STORE, "product"],
    PRODUCT_SOLD_OUT: [STORE, "product"],
    PRODUCT_EXPIRING_SOON: [STORE, "product"],
    PICKUP_TODAY: [RESTAURANT, "reservation"],
    RESERVATION_COMPLETED: [RESTAURANT, "reservation"],
    PICKUP_MISSED: [RESTAURANT, "reservation"],
    PRODUCT_REMOVED_BY_ADMIN: [STORE, "product"],
    DONATION_REMOVED_BY_ADMIN: [STORE, "donation"],
    RESERVATION_CANCELLED_BY_ADMIN: [STORE, "reservation"],
    RESERVATION_CANCELLED_STORE_CLOSED: [RESTAURANT, "reservation"],
    BRANCH_BLOCKED: [HQ, "branch"],
    BRANCH_UNBLOCKED: [HQ, "branch"],
    BRANCH_DEACTIVATED: [HQ, "branch"],
    BRANCH_REACTIVATED: [HQ, "branch"],
    PLATFORM_ANNOUNCEMENT: [RESTAURANT, "none"],
    CREDIT_REQUEST_CREATED: [ADMIN, "credit"],
    CREDIT_REQUEST_APPROVED: [BRANCH, "credit"],
    CREDIT_REQUEST_REJECTED: [BRANCH, "credit"],
    CREDIT_RENEWAL_CREATED: [BRANCH, "credit"],
    CREDIT_REQUEST_EXPIRED: [BRANCH, "credit"],
    CREDIT_RENEWAL_SKIPPED: [RESTAURANT, "none"],
    BRANCH_TOPUP_REQUESTED: [HQ, "branchCredit"],
    BRANCH_CREDIT_REQUEST_APPROVED: [HQ, "branchCredit"],
    BRANCH_CREDIT_REQUEST_REJECTED: [HQ, "branchCredit"],
    BRANCH_CREDIT_REQUEST_EXPIRED: [HQ, "branchCredit"],
    CREDIT_TOPUP_COMPANY_APPROVED: [BRANCH, "credit"],
    CREDIT_TOPUP_COMPANY_REJECTED: [BRANCH, "credit"],
    PASSWORD_CHANGED: [RESTAURANT, "none"],
  };

  for (const [type, [recipient, link]] of Object.entries(cases) as [NotificationType, [string, string]][]) {
    await pool.query("DELETE FROM email_queue");
    await createNotification(pool, {
      userId: await userId(recipient),
      type,
      message: `English fallback for ${type}`,
      ...links[link],
      details: type === "PRODUCT_REMOVED_BY_ADMIN" ? "Neispravan opis" : null,
    });
    const rows = await emailsTo(recipient);
    expect(rows.map((row) => row.template), type).toEqual([type]);
    expect(rows[0]!.language).toBe("bs");
    const { bs, en } = renderBoth(rows[0]!);
    expect(bs.subject, type).not.toBe(en.subject);
    expect(bs.text, type).toContain(APP_URL);
    expect(en.html, type).toContain(`href="${APP_URL}`);
  }
  // Every type was checked, which the Record type also enforces.
  expect(Object.keys(cases)).toHaveLength(33);
  expect(restaurantId).toBeGreaterThan(0);
});

it("the actions of both sides queue their emails with the right links", async () => {
  const product = await createProduct(store, { name: "Mlijeko", unit: "l", quantity: 10 });
  const first = await reserve(restaurant, product.id, 2);
  const second = await reserve(restaurant, product.id, 3);
  expect((await store.patch(`/api/reservations/${first}/accept`)).status).toBe(200);
  expect((await store.patch(`/api/reservations/${second}/reject`)).status).toBe(200);
  expect((await store.patch(`/api/reservations/${first}/complete`)).status).toBe(200);
  const third = await reserve(restaurant, product.id, 1);
  expect((await restaurant.patch(`/api/reservations/${third}/cancel`)).status).toBe(200);

  expect((await emailsTo(STORE)).map((row) => row.template)).toEqual([
    "RESERVATION_CREATED",
    "RESERVATION_CREATED",
    "RESERVATION_CREATED",
    "RESERVATION_CANCELLED",
  ]);
  const toRestaurant = await emailsTo(RESTAURANT);
  expect(toRestaurant.map((row) => row.template)).toEqual([
    "RESERVATION_ACCEPTED",
    "RESERVATION_REJECTED",
    "RESERVATION_COMPLETED",
  ]);
  const accepted = renderBoth(toRestaurant[0]!);
  expect(accepted.bs.subject).toBe("Rezervacija prihvaćena: Mlijeko");
  expect(accepted.en.subject).toBe("Reservation accepted: Mlijeko");
  expect(accepted.bs.text).toContain("Prodavnica: Test Business");
  expect(accepted.bs.text).toContain(`Otvori rezervaciju: ${APP_URL}/reservation/${first}`);
  expect(renderBoth(toRestaurant[1]!).bs.text).toContain("Kredit za rezervaciju vam je vraćen.");
  expect(renderBoth(toRestaurant[2]!).en.text).toContain("The store confirmed that you picked up 2 l Mlijeko.");
});

it("an admin's reason is in the email, as in the notification", async () => {
  const product = await createProduct(store, { name: "Sir" });
  const reservationId = await reserve(restaurant, product.id, 1);
  await pool.query("DELETE FROM email_queue");
  const removed = await admin.delete(`/api/admin/products/${product.id}`).send({ reason: "Neispravan opis" });
  expect(removed.status).toBe(200);

  const [toStore] = await emailsTo(STORE);
  expect(toStore!.template).toBe("PRODUCT_REMOVED_BY_ADMIN");
  const { bs, en } = renderBoth(toStore!);
  expect(bs.subject).toBe("Proizvod uklonjen: Sir");
  expect(bs.text).toContain("Razlog: Neispravan opis");
  expect(en.text).toContain("Reason: Neispravan opis");
  expect(bs.text).toContain(`Otvori proizvod: ${APP_URL}/products/${product.id}`);
  // The restaurant's pending reservation was cancelled with it.
  expect((await emailsTo(RESTAURANT)).map((row) => row.template)).toEqual(["RESERVATION_CANCELLED_BY_ADMIN"]);
  expect(reservationId).toBeGreaterThan(0);

  const donation = await createDonation(store, { name: "Kifle" });
  expect((await admin.delete(`/api/admin/donations/${donation.id}`).send({ reason: "Duplikat" })).status).toBe(200);
  const donationEmail = (await emailsTo(STORE)).at(-1)!;
  expect(donationEmail.template).toBe("DONATION_REMOVED_BY_ADMIN");
  const rendered = renderBoth(donationEmail);
  expect(rendered.bs.text).toContain("Donacija: Kifle");
  expect(rendered.bs.text).toContain("Razlog: Duplikat");
  expect(rendered.bs.text).toContain(`${APP_URL}/donate-food`);
});

it("an announcement emails every recipient in their language, with its own title and text", async () => {
  await insertUser(BLOCKED, "RESTAURANT", "Blocked Restaurant");
  await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [BLOCKED]);
  const response = await admin.post("/api/admin/announcements").send({
    audience: "ALL",
    title_bs: "Novi rok",
    body_bs: "Od ponedjeljka se preuzima do 20h.\nHvala!",
    title_en: "New deadline",
    body_en: "From Monday pickups close at 8pm.",
  });
  expect(response.status).toBe(201);

  for (const email of [STORE, RESTAURANT, HQ, BRANCH]) {
    expect((await emailsTo(email)).map((row) => row.template), email).toEqual(["PLATFORM_ANNOUNCEMENT"]);
  }
  expect(await emailsTo(BLOCKED)).toEqual([]);
  expect(await emailsTo(ADMIN)).toEqual([]);
  const { count } = (
    await pool.query("SELECT COUNT(*) AS count FROM email_queue WHERE template = 'PLATFORM_ANNOUNCEMENT'")
  ).rows[0];
  expect(Number(count)).toBe(response.body.recipients);

  const { bs, en } = renderBoth((await emailsTo(RESTAURANT))[0]!);
  expect(bs.subject).toBe("Obavještenje platforme: Novi rok");
  expect(bs.text).toContain("Od ponedjeljka se preuzima do 20h.\n\nHvala!");
  expect(en.subject).toBe("Platform announcement: New deadline");
  expect(en.text).toContain("From Monday pickups close at 8pm.");
  expect(bs.text).toContain(`Otvori FoodWise: ${APP_URL}/dashboard`);
});

it("credit requests email the admins, and the decision emails the requester", async () => {
  const response = await restaurant.post("/api/credits/requests").send({
    request_type: "TOPUP",
    topup_package_id: (await pool.query("SELECT id FROM topup_packages WHERE credits = 20")).rows[0].id,
  });
  expect(response.status).toBe(201);
  const requestId = response.body.request.id;

  const [toAdmin] = await emailsTo(ADMIN);
  expect(toAdmin!.template).toBe("CREDIT_REQUEST_CREATED");
  const created = renderBoth(toAdmin!);
  expect(created.bs.subject).toBe("Novi zahtjev za dodatne kredite: Test Business");
  expect(created.bs.text).toContain("Podnosilac: Test Business");
  expect(created.bs.text).toContain("Krediti: 20");
  expect(created.bs.text).toContain(`Otvori zahtjeve: ${APP_URL}/admin/credit-requests`);

  expect((await admin.post(`/api/admin/credits/requests/${requestId}/reject`).send({ note: "No payment" })).status).toBe(
    200,
  );
  const [decision] = await emailsTo(RESTAURANT);
  expect(decision!.template).toBe("CREDIT_REQUEST_REJECTED");
  const rejected = renderBoth(decision!);
  expect(rejected.en.subject).toBe("Your request for extra credits was rejected");
  // The admin's note never reaches the user.
  expect(rejected.bs.text).not.toContain("No payment");
  expect(rejected.bs.text).toContain(`${APP_URL}/credits`);
});

it("the headquarters' bulk notifications and the admins' email go through the queue", async () => {
  const branch = { id: await userId(BRANCH), company_id: companyId, business_name: "Poslovnica Visoko" };
  await notifyCompanyHq(pool, branch, "BRANCH_BLOCKED", "Kasni s preuzimanjima");
  const topup = await pool.query<{ id: number }>(
    `INSERT INTO credit_requests (user_id, request_type, topup_package_id, period_month, source, status)
     SELECT $1, 'TOPUP', topup_packages.id, date_trunc('month', CURRENT_DATE)::date, 'BRANCH', 'COMPANY_REVIEW'
     FROM topup_packages WHERE topup_packages.credits = 20
     RETURNING id`,
    [branch.id],
  );
  await notifyCompanyHqOfCredit(pool, topup.rows[0]!.id, "BRANCH_TOPUP_REQUESTED", "Branch asks for credits");
  await notifyAdminsOfCreditRequest(pool, topup.rows[0]!.id, "New credit request");

  const toHq = await emailsTo(HQ);
  expect(toHq.map((row) => row.template)).toEqual(["BRANCH_BLOCKED", "BRANCH_TOPUP_REQUESTED"]);
  const blocked = renderBoth(toHq[0]!);
  expect(blocked.bs.subject).toBe("Poslovnica blokirana: Poslovnica Visoko");
  expect(blocked.bs.text).toContain("Razlog: Kasni s preuzimanjima");
  expect(blocked.bs.text).toContain(`Otvori poslovnicu: ${APP_URL}/company/branches/${branch.id}`);
  expect(renderBoth(toHq[1]!).bs.text).toContain(`${APP_URL}/company/credits`);
  // A branch's request names its company for the admin.
  const [toAdmin] = await emailsTo(ADMIN);
  expect(renderBoth(toAdmin!).bs.text).toContain(`Podnosilac: ${COMPANY} → Poslovnica Visoko`);
});

it("the reminder and expiry jobs queue their emails", async () => {
  const tomorrow = await createProduct(store, { name: "Kajmak", expiry_date: futureDate(1) });
  await reserve(restaurant, tomorrow.id, 1);
  const today = await createProduct(store, { name: "Burek", expiry_date: futureDate(0) });
  const reserved = await restaurant
    .post("/api/reservations")
    .send({ product_id: today.id, quantity: 1, pickup_date: `${futureDate(0)}T12:00:00` });
  expect(reserved.status).toBe(201);
  expect((await store.patch(`/api/reservations/${reserved.body.reservation.id}/accept`)).status).toBe(200);
  const expired = await pool.query<{ id: number }>(
    `INSERT INTO products (store_id, name, category, original_price, discounted_price, quantity, unit, expiry_date)
     VALUES ($1, 'Stari sir', 'Dairy', 2, 1, 5, 'kg', CURRENT_DATE - 1) RETURNING id`,
    [await userId(STORE)],
  );
  await pool.query("DELETE FROM email_queue");

  await sendReminders();
  await expireProducts();

  const toStore = await emailsTo(STORE);
  expect(toStore.map((row) => row.template).sort()).toEqual(["PRODUCT_EXPIRED", "PRODUCT_EXPIRING_SOON"]);
  const expiring = renderBoth(toStore.find((row) => row.template === "PRODUCT_EXPIRING_SOON")!);
  expect(expiring.bs.subject).toBe("Podsjetnik: Kajmak ističe sutra");
  expect(expiring.bs.text).toContain(`${APP_URL}/products/${tomorrow.id}`);
  const expiredEmail = renderBoth(toStore.find((row) => row.template === "PRODUCT_EXPIRED")!);
  expect(expiredEmail.bs.text).toContain(`${APP_URL}/products/${expired.rows[0]!.id}`);

  const toRestaurant = await emailsTo(RESTAURANT);
  expect(toRestaurant.map((row) => row.template)).toEqual(["PICKUP_TODAY"]);
  const reminder = renderBoth(toRestaurant[0]!);
  expect(reminder.bs.subject).toBe("Podsjetnik: danas preuzimate Burek");
  expect(reminder.bs.text).toMatch(/Preuzimanje: \d{2}\.\d{2}\.\d{4}\. 12:00/);

  // Running the reminders again sends nothing twice.
  await pool.query("DELETE FROM email_queue");
  await sendReminders();
  expect(await emailsTo(STORE)).toEqual([]);
  expect(await emailsTo(RESTAURANT)).toEqual([]);
});

it("blocked users and deleted accounts get no emails", async () => {
  const product = await createProduct(store, { name: "Med" });
  await reserve(restaurant, product.id, 1);
  expect(await emailsTo(STORE)).toHaveLength(1);

  // A blocked store: its notifications are still stored, but no email is queued.
  await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [STORE]);
  await createNotification(pool, { userId: await userId(STORE), type: "PRODUCT_SOLD_OUT", message: "Sold out", productId: product.id });
  expect(await emailsTo(STORE)).toHaveLength(1);

  // A deleted account takes its queued emails with it.
  await cleanupUsers([STORE]);
  expect(await emailsTo(STORE)).toEqual([]);
  expect(await login(RESTAURANT)).toBeDefined();
});
