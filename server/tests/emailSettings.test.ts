import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { enqueueEmail, processEmailQueue } from "../src/email/queue.js";
import { renderLayout } from "../src/email/templates/layout.js";
import type { EmailMessage, EmailTransport } from "../src/email/transports.js";
import {
  cleanupCompanies,
  cleanupUsers,
  createProduct,
  insertCompany,
  insertUser,
  login,
  registerAndLogin,
  reserve,
  userId,
  type Agent,
} from "./helpers.js";

// Two templates that are not notifications, for the system-email rule: a system one (like the
// coming password reset) and an ordinary one.
vi.mock("../src/email/templates/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/email/templates/index.js")>();
  const testTemplate = (system: boolean) => ({
    system,
    render: (_data: unknown, lang: "bs" | "en") =>
      renderLayout({
        lang,
        subject: system ? "Reset your password" : "Weekly tips",
        heading: "Test",
        intro: ["Test"],
        button: { label: "Open", url: "https://app.example.com" },
      }),
  });
  const templates: typeof original.EMAIL_TEMPLATES = {
    ...original.EMAIL_TEMPLATES,
    TEST_SYSTEM: testTemplate(true),
    TEST_PLAIN: testTemplate(false),
  };
  return {
    ...original,
    EMAIL_TEMPLATES: templates,
    emailTemplate: (name: string) => (Object.hasOwn(templates, name) ? templates[name] : undefined),
  };
});

const STORE = "email-settings-store@test.com";
const RESTAURANT = "email-settings-restaurant@test.com";
const ADMIN = "email-settings-admin@test.com";
const HQ = "email-settings-hq@test.com";
const COMPANY = "Email Settings d.o.o.";
const EMAILS = [STORE, RESTAURANT, ADMIN, HQ];
const CONFIG = { from: "FoodWise <no-reply@example.com>", redirectTo: null, appUrl: "https://app.example.com" };

interface QueueRow {
  id: number;
  recipient: string;
  template: string;
  status: string;
  last_error: string | null;
}

const queueRows = async (): Promise<QueueRow[]> =>
  (await pool.query<QueueRow>("SELECT id, recipient, template, status, last_error FROM email_queue ORDER BY id")).rows;

const fakeTransport = () => {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    name: "smtp",
    send: async (message) => {
      sent.push(message);
    },
  };
  return { transport, sent };
};

const setEmails = (agent: Agent, enabled: unknown) =>
  agent.patch("/api/users/me/email-notifications").send({ enabled });

let store: Agent;
let restaurant: Agent;

beforeEach(async () => {
  await pool.query("DELETE FROM email_queue");
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
});

afterEach(async () => {
  await cleanupUsers(EMAILS);
  await cleanupCompanies([COMPANY]);
});

describe("the switch", () => {
  it("is on by default and every role can turn it off and on", async () => {
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    await insertUser(HQ, "COMPANY", null, null, await insertCompany(COMPANY));
    const hq = await login(HQ);

    for (const agent of [store, restaurant, admin, hq]) {
      expect((await agent.get("/api/users/me")).body.user.email_notifications).toBe(true);

      const off = await setEmails(agent, false);
      expect(off.status).toBe(200);
      expect(off.body).toEqual({ message: "Email notifications turned off.", email_notifications: false });
      expect((await agent.get("/api/users/me")).body.user.email_notifications).toBe(false);

      const on = await setEmails(agent, true);
      expect(on.body).toEqual({ message: "Email notifications turned on.", email_notifications: true });
      expect((await agent.get("/api/users/me")).body.user.email_notifications).toBe(true);
    }
  });

  it("changes only the caller's own setting", async () => {
    await setEmails(store, false);
    const { rows } = await pool.query("SELECT email, email_notifications FROM users WHERE email = ANY($1) ORDER BY email", [
      [STORE, RESTAURANT],
    ]);
    expect(rows).toEqual([
      { email: RESTAURANT, email_notifications: true },
      { email: STORE, email_notifications: false },
    ]);
  });

  it.each([undefined, "false", 0, null, "off"])("refuses enabled=%s", async (enabled) => {
    const response = await setEmails(store, enabled);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Email notifications must be turned on or off.");
  });

  it("needs a session", async () => {
    expect((await request(app).patch("/api/users/me/email-notifications").send({ enabled: false })).status).toBe(401);
  });
});

describe("notification emails follow it", () => {
  it("queues nothing for a user who turned it off, but the notification is still there", async () => {
    await setEmails(store, false);
    const product = await createProduct(store, { name: "Kefir" });
    const reservationId = await reserve(restaurant, product.id, 1);
    expect(await queueRows()).toEqual([]);
    const notifications = (await store.get("/api/notifications")).body.notifications;
    expect(notifications.map((n: { reservation_id: number }) => n.reservation_id)).toContain(reservationId);

    // The restaurant still gets its own emails.
    expect((await store.patch(`/api/reservations/${reservationId}/accept`)).status).toBe(200);
    expect((await queueRows()).map((row) => [row.template, row.recipient])).toEqual([
      ["RESERVATION_ACCEPTED", RESTAURANT],
    ]);

    // On again: the next reservation's email is queued.
    await setEmails(store, true);
    await reserve(restaurant, product.id, 1);
    expect((await queueRows()).map((row) => row.template)).toEqual(["RESERVATION_ACCEPTED", "RESERVATION_CREATED"]);
  });

  it("skips an email queued before the user turned it off", async () => {
    const product = await createProduct(store, { name: "Kefir" });
    await reserve(restaurant, product.id, 1);
    await setEmails(store, false);
    const { transport, sent } = fakeTransport();

    expect(await processEmailQueue({ transport, config: CONFIG })).toEqual({
      sent: 0,
      retrying: 0,
      failed: 0,
      skipped: 1,
    });
    expect(sent).toEqual([]);
    expect(await queueRows()).toEqual([
      expect.objectContaining({
        status: "SKIPPED",
        last_error: "The recipient turned email notifications off.",
      }),
    ]);
    // A skipped email is not tried again, also after turning it back on.
    await setEmails(store, true);
    await processEmailQueue({ transport, config: CONFIG });
    expect(sent).toEqual([]);
  });

  it("skips an email whose recipient was blocked after it was queued", async () => {
    const product = await createProduct(store, { name: "Kefir" });
    await reserve(restaurant, product.id, 1);
    await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [STORE]);
    const { transport, sent } = fakeTransport();
    expect((await processEmailQueue({ transport, config: CONFIG })).skipped).toBe(1);
    expect(sent).toEqual([]);
    expect((await queueRows())[0]).toMatchObject({ status: "SKIPPED", last_error: "The recipient is blocked." });
  });

  it("links to the switch in the footer of every notification email", async () => {
    const product = await createProduct(store, { name: "Kefir" });
    await reserve(restaurant, product.id, 1);
    const { transport, sent } = fakeTransport();
    await processEmailQueue({ transport, config: CONFIG });
    expect(sent[0]!.text).toContain("Isključite email obavijesti: https://app.example.com/my-profile#email-notifications");
    expect(sent[0]!.html).toContain('href="https://app.example.com/my-profile#email-notifications"');
  });
});

describe("system emails ignore it", () => {
  it("queues a system email for a user who turned it off, but not an ordinary one", async () => {
    await setEmails(store, false);
    const storeId = await userId(STORE);
    expect(await enqueueEmail(pool, { userId: storeId, template: "TEST_SYSTEM", data: {} })).toBe(true);
    expect(await enqueueEmail(pool, { userId: storeId, template: "TEST_PLAIN", data: {} })).toBe(false);
    expect((await queueRows()).map((row) => row.template)).toEqual(["TEST_SYSTEM"]);
  });

  it("sends a queued system email after the user turned it off, and skips an ordinary one", async () => {
    const storeId = await userId(STORE);
    await enqueueEmail(pool, { userId: storeId, template: "TEST_SYSTEM", data: {} });
    await enqueueEmail(pool, { userId: storeId, template: "TEST_PLAIN", data: {} });
    await setEmails(store, false);
    const { transport, sent } = fakeTransport();

    expect(await processEmailQueue({ transport, config: CONFIG })).toEqual({
      sent: 1,
      retrying: 0,
      failed: 0,
      skipped: 1,
    });
    expect(sent.map((message) => message.subject)).toEqual(["Reset your password"]);
    expect((await queueRows()).map((row) => [row.template, row.status])).toEqual([
      ["TEST_SYSTEM", "SENT"],
      ["TEST_PLAIN", "SKIPPED"],
    ]);
  });

  it("still never goes to a blocked user", async () => {
    await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [STORE]);
    expect(await enqueueEmail(pool, { userId: await userId(STORE), template: "TEST_SYSTEM", data: {} })).toBe(false);
  });

  it("refuses an unknown template", async () => {
    await expect(enqueueEmail(pool, { userId: await userId(STORE), template: "NOPE", data: {} })).rejects.toThrow(
      "Unknown email template: NOPE",
    );
  });

  it("a system email has no link to the switch", () => {
    const email = renderLayout({
      lang: "en",
      subject: "Reset your password",
      heading: "Reset",
      intro: ["x"],
      button: { label: "Reset", url: "https://app.example.com/reset" },
    });
    expect(email.text).not.toContain("Turn off email notifications");
    expect(email.html).not.toContain("#email-notifications");
  });
});
