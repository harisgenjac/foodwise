import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { RESET_LINKS_PER_HOUR } from "../src/controllers/password.controller.js";
import { processEmailQueue } from "../src/email/queue.js";
import type { EmailMessage, EmailTransport } from "../src/email/transports.js";
import { hashToken } from "../src/services/authTokens.js";
import {
  cleanupCompanies,
  cleanupUsers,
  insertCompany,
  insertUser,
  login,
  PASSWORD,
  registerAndLogin,
  userId,
} from "./helpers.js";

const STORE = "password-reset-store@test.com";
const BLOCKED = "password-reset-blocked@test.com";
const BRANCH = "password-reset-branch@test.com";
const COMPANY = "Password Reset d.o.o.";
const ADMIN = "password-reset-admin@test.com";
const EMAILS = [STORE, BLOCKED, BRANCH, ADMIN];
const NEW_PASSWORD = "nova-lozinka-123";
const SAME_ANSWER = { message: "If an account exists for this email, we sent a link to set a new password." };
const INVALID_LINK = "This link is invalid or has expired.";

const forgot = (email: string) => request(app).post("/api/auth/forgot-password").send({ email });
const reset = (token: string, password = NEW_PASSWORD) =>
  request(app).post("/api/auth/reset-password").send({ token, password });
const check = (token: string) => request(app).post("/api/auth/reset-password/check").send({ token });

// The raw tokens of the reset emails queued for an address, oldest first.
const tokensSentTo = async (email: string): Promise<string[]> =>
  (
    await pool.query<{ token: string }>(
      `SELECT email_queue.data->>'token' AS token FROM email_queue
       WHERE email_queue.recipient = $1 AND email_queue.template = 'PASSWORD_RESET' ORDER BY email_queue.id`,
      [email],
    )
  ).rows.map((row) => row.token);

const requestToken = async (email = STORE) => {
  expect((await forgot(email)).body).toEqual(SAME_ANSWER);
  return (await tokensSentTo(email)).at(-1)!;
};

const fakeTransport = () => {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = { name: "smtp", send: async (message) => void sent.push(message) };
  return { transport, sent };
};
const CONFIG = { from: "FoodWise <no-reply@example.com>", redirectTo: null, appUrl: "https://app.example.com" };

beforeEach(async () => {
  await pool.query("DELETE FROM email_queue");
  await insertUser(STORE, "STORE");
});

afterEach(async () => {
  await cleanupUsers(EMAILS);
  await cleanupCompanies([COMPANY]);
});

describe("asking for a link", () => {
  it("answers the same for an account, an unknown email and a blocked account, and emails only the account", async () => {
    await insertUser(BLOCKED, "RESTAURANT");
    await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [BLOCKED]);
    const companyId = await insertCompany(COMPANY);
    await insertUser(BRANCH, "STORE", "Poslovnica", 1000, companyId);
    await pool.query("UPDATE users SET deactivated_at = NOW() WHERE email = $1", [BRANCH]);

    for (const email of [STORE, "nobody-here@test.com", BLOCKED, BRANCH, ` ${STORE.toUpperCase()} `]) {
      const response = await forgot(email);
      expect(response.status, email).toBe(200);
      expect(response.body, email).toEqual(SAME_ANSWER);
    }
    // Two emails to the store (also for the upper-case address), none to anyone else.
    const { rows } = await pool.query("SELECT recipient, template FROM email_queue ORDER BY id");
    expect(rows).toEqual([
      { recipient: STORE, template: "PASSWORD_RESET" },
      { recipient: STORE, template: "PASSWORD_RESET" },
    ]);
    const tokens = await pool.query("SELECT auth_tokens.user_id FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))", [
      [BLOCKED, BRANCH],
    ]);
    expect(tokens.rows).toEqual([]);
  });

  it("refuses an email that is not valid", async () => {
    for (const email of ["", "not-an-email", undefined]) {
      const response = await forgot(email as string);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Email is not valid.");
    }
  });

  it("logs the request in the account's activity", async () => {
    await requestToken();
    const { rows } = await pool.query("SELECT event, ip FROM account_events WHERE user_id = $1", [await userId(STORE)]);
    expect(rows).toEqual([{ event: "PASSWORD_RESET_REQUESTED", ip: expect.any(String) }]);
  });

  it(`sends at most ${RESET_LINKS_PER_HOUR} links an hour to one account, with the same answer`, async () => {
    for (let i = 0; i < RESET_LINKS_PER_HOUR + 2; i += 1) {
      const response = await forgot(STORE);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(SAME_ANSWER);
    }
    expect(await tokensSentTo(STORE)).toHaveLength(RESET_LINKS_PER_HOUR);
    // An hour later it works again.
    await pool.query("UPDATE auth_tokens SET created_at = created_at - interval '61 minutes'");
    await forgot(STORE);
    expect(await tokensSentTo(STORE)).toHaveLength(RESET_LINKS_PER_HOUR + 1);
  });
});

describe("the token", () => {
  it("is stored only as its hash", async () => {
    const token = await requestToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await pool.query("SELECT token_hash, purpose FROM auth_tokens WHERE user_id = $1", [await userId(STORE)]);
    expect(rows).toEqual([{ token_hash: hashToken(token), purpose: "PASSWORD_RESET" }]);
    expect(rows[0].token_hash).not.toContain(token);
  });

  it("leaves the queue once the email is sent", async () => {
    const token = await requestToken();
    const { transport, sent } = fakeTransport();
    await processEmailQueue({ transport, config: CONFIG });
    expect(sent[0]!.subject).toBe("Postavite novu lozinku");
    expect(sent[0]!.text).toContain(`https://app.example.com/reset-password?token=${token}`);
    expect(sent[0]!.text).not.toContain("Isključite email obavijesti");
    expect(await tokensSentTo(STORE)).toEqual([null]);
  });

  it("is sent even with email notifications off", async () => {
    await pool.query("UPDATE users SET email_notifications = false WHERE email = $1", [STORE]);
    await requestToken();
    const { transport, sent } = fakeTransport();
    expect((await processEmailQueue({ transport, config: CONFIG })).sent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("works for 1 hour", async () => {
    const token = await requestToken();
    expect((await check(token)).body).toEqual({ message: "The link is valid.", purpose: "PASSWORD_RESET" });
    await pool.query("UPDATE auth_tokens SET expires_at = NOW() - interval '1 second'");
    expect((await check(token)).body.error).toBe(INVALID_LINK);
    const response = await reset(token);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(INVALID_LINK);
  });

  it("expires 60 minutes after it was made", async () => {
    await requestToken();
    const { rows } = await pool.query<{ minutes: string }>(
      "SELECT EXTRACT(EPOCH FROM expires_at - created_at) / 60 AS minutes FROM auth_tokens WHERE user_id = $1",
      [await userId(STORE)],
    );
    expect(Math.round(Number(rows[0]!.minutes))).toBe(60);
  });

  it("can be used once", async () => {
    const token = await requestToken();
    expect((await reset(token)).status).toBe(200);
    const again = await reset(token, "jos-jedna-lozinka");
    expect(again.status).toBe(400);
    expect(again.body.error).toBe(INVALID_LINK);
    expect((await login(STORE, NEW_PASSWORD)).get).toBeDefined();
  });

  it("stops working when a newer one is sent", async () => {
    const first = await requestToken();
    const second = await requestToken();
    expect((await check(first)).status).toBe(400);
    expect((await reset(first)).body.error).toBe(INVALID_LINK);
    expect((await reset(second)).status).toBe(200);
  });

  it("stops working when the account is blocked", async () => {
    const token = await requestToken();
    await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [STORE]);
    expect((await reset(token)).body.error).toBe(INVALID_LINK);
  });

  it("refuses unknown and malformed tokens", async () => {
    for (const token of ["nope", "", "x".repeat(500), undefined]) {
      expect((await check(token as string)).body.error).toBe(INVALID_LINK);
      expect((await reset(token as string)).body.error).toBe(INVALID_LINK);
    }
  });
});

describe("setting the new password", () => {
  it("needs at least 8 characters and leaves the token usable", async () => {
    const token = await requestToken();
    const short = await reset(token, "kratka");
    expect(short.status).toBe(400);
    expect(short.body.error).toBe("Password must be at least 8 characters long.");
    expect((await check(token)).status).toBe(200);
  });

  it("changes the password, signs out every session and clears the temporary password", async () => {
    await pool.query("UPDATE users SET must_change_password = true WHERE email = $1", [STORE]);
    const phone = await login(STORE);
    const laptop = await login(STORE);
    expect((await phone.get("/api/users/me")).status).toBe(200);

    const response = await reset(await requestToken());
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Your password was changed. You can log in now." });

    for (const session of [phone, laptop]) {
      const me = await session.get("/api/users/me");
      expect(me.status).toBe(401);
      expect(me.body.error).toBe("Token is invalid or has expired.");
    }
    const old = await request(app).post("/api/auth/login").send({ email: STORE, password: PASSWORD });
    expect(old.status).toBe(400);
    const fresh = await login(STORE, NEW_PASSWORD);
    const me = await fresh.get("/api/users/me");
    expect(me.status).toBe(200);
    expect(me.body.user.must_change_password).toBe(false);
  });

  it("tells the user in the app and by email, even with email notifications off, and logs it", async () => {
    await pool.query("UPDATE users SET email_notifications = false WHERE email = $1", [STORE]);
    await reset(await requestToken());
    const storeId = await userId(STORE);

    const notifications = await pool.query("SELECT type FROM notifications WHERE user_id = $1", [storeId]);
    expect(notifications.rows).toEqual([{ type: "PASSWORD_CHANGED" }]);
    const { transport, sent } = fakeTransport();
    await processEmailQueue({ transport, config: CONFIG });
    expect(sent.map((message) => message.subject)).toEqual(["Postavite novu lozinku", "Vaša lozinka je promijenjena"]);
    expect(sent[1]!.text).toContain("Ako to niste bili vi");
    expect(sent[1]!.text).not.toContain("Isključite email obavijesti");

    const events = await pool.query("SELECT event FROM account_events WHERE user_id = $1 ORDER BY id", [storeId]);
    expect(events.rows.map((row) => row.event)).toEqual(["PASSWORD_RESET_REQUESTED", "PASSWORD_RESET"]);
  });

  it("lets two resets with the same token race and only one wins", async () => {
    const token = await requestToken();
    const statuses = (await Promise.all([reset(token, "prva-lozinka-1"), reset(token, "druga-lozinka-2")]))
      .map((response) => response.status)
      .sort();
    expect(statuses).toEqual([200, 400]);
  });
});

describe("the account activity", () => {
  it("is on the admin's user page, newest first, apart from the admin log", async () => {
    await reset(await requestToken());
    const admin = await registerAndLogin(ADMIN, "ADMIN");
    const response = await admin.get(`/api/admin/users/${await userId(STORE)}`);
    expect(response.status).toBe(200);
    expect(response.body.events.map((event: { event: string }) => event.event)).toEqual([
      "PASSWORD_RESET",
      "PASSWORD_RESET_REQUESTED",
    ]);
    expect(response.body.events[0]).toEqual({ id: expect.any(Number), event: "PASSWORD_RESET", ip: expect.any(String), created_at: expect.any(String) });
    expect(response.body.actions).toEqual([]);
  });
});
