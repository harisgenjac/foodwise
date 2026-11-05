import request from "supertest";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { processEmailQueue } from "../src/email/queue.js";
import type { EmailMessage, EmailTransport } from "../src/email/transports.js";
import { hashToken } from "../src/services/authTokens.js";
import { cleanupUsers, insertUser, login, PASSWORD, registerAndLogin, userId, type Agent } from "./helpers.js";

const ADMIN = "invitations-admin@test.com";
const NEW_USER = "invitations-new@test.com";
const STORE = "invitations-store@test.com";
const EMAILS = [ADMIN, NEW_USER, STORE];
const OWN_PASSWORD = "moja-lozinka-123";
const INVALID_LINK = "This link is invalid or has expired.";
const CONFIG = { from: "FoodWise <no-reply@example.com>", redirectTo: null, appUrl: "https://app.example.com" };

// The raw tokens of the emails of a template queued for an address, oldest first.
const tokensSentTo = async (email: string, template = "INVITATION"): Promise<string[]> =>
  (
    await pool.query<{ token: string }>(
      `SELECT email_queue.data->>'token' AS token FROM email_queue
       WHERE email_queue.recipient = $1 AND email_queue.template = $2 ORDER BY email_queue.id`,
      [email, template],
    )
  ).rows.map((row) => row.token);

const adminActions = async (targetEmail: string) =>
  (
    await pool.query<{ action: string; admin_id: number }>(
      `SELECT admin_actions.action, admin_actions.admin_id FROM admin_actions
       JOIN users ON users.id = admin_actions.target_user_id
       WHERE users.email = $1 ORDER BY admin_actions.id`,
      [targetEmail],
    )
  ).rows.map((row) => row.action);

const setPassword = (token: string, password = OWN_PASSWORD) =>
  request(app).post("/api/auth/reset-password").send({ token, password });

let admin: Agent;

beforeEach(async () => {
  await pool.query("DELETE FROM email_queue");
  admin = await registerAndLogin(ADMIN, "ADMIN");
});

afterEach(async () => {
  await cleanupUsers(EMAILS);
});

const invite = (body: Record<string, unknown> = {}) =>
  admin.post("/api/admin/users").send({ role: "STORE", email: NEW_USER, ...body });

describe("creating an account with an invitation", () => {
  it("is the default: no password, an invitation email and both admin actions", async () => {
    const response = await invite();
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("User created and invitation sent.");
    expect(response.body.user).toMatchObject({ email: NEW_USER, must_change_password: false, last_login_at: null });

    const [token] = await tokensSentTo(NEW_USER);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await pool.query(
      `SELECT purpose, token_hash, created_by, EXTRACT(EPOCH FROM expires_at - created_at) / 3600 AS hours
       FROM auth_tokens WHERE user_id = $1`,
      [response.body.user.id],
    );
    expect(rows).toEqual([
      { purpose: "INVITATION", token_hash: hashToken(token!), created_by: await userId(ADMIN), hours: expect.anything() },
    ]);
    expect(Math.round(Number(rows[0].hours))).toBe(72);
    expect(await adminActions(NEW_USER)).toEqual(["CREATE_USER", "SEND_INVITATION"]);

    // Nobody knows a password for the account yet.
    const attempt = await request(app).post("/api/auth/login").send({ email: NEW_USER, password: PASSWORD });
    expect(attempt.status).toBe(400);
  });

  it("emails a link to /set-password, also with email notifications off", async () => {
    await invite({ method: "INVITE" });
    await pool.query("UPDATE users SET email_notifications = false WHERE email = $1", [NEW_USER]);
    const sent: EmailMessage[] = [];
    const transport: EmailTransport = { name: "smtp", send: async (message) => void sent.push(message) };
    await processEmailQueue({ transport, config: CONFIG });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("Pozivnica za FoodWise");
    expect(sent[0]!.text).toMatch(/Postavi lozinku: https:\/\/app\.example\.com\/set-password\?token=[A-Za-z0-9_-]{43}/);
    expect(sent[0]!.text).toContain("Link vrijedi 72 sata");
    expect(sent[0]!.text).not.toContain("Isključite email obavijesti");
  });

  it("keeps the temporary password option, with no email", async () => {
    const response = await invite({ method: "PASSWORD", password: PASSWORD });
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("User created successfully.");
    expect(response.body.user.must_change_password).toBe(true);
    expect(await tokensSentTo(NEW_USER)).toEqual([]);
    expect(await adminActions(NEW_USER)).toEqual(["CREATE_USER"]);
    expect((await login(NEW_USER, PASSWORD)).get).toBeDefined();
  });

  it.each([
    [{ method: "PASSWORD" }, "Password must be at least 8 characters long."],
    [{ method: "PASSWORD", password: "kratka" }, "Password must be at least 8 characters long."],
    [{ method: "SMS" }, "Choose an invitation or a temporary password."],
    [{ email: "" }, "Email and role are required."],
    [{ email: "not-an-email" }, "Email is not valid."],
  ])("refuses %j", async (body, message) => {
    const response = await invite(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(message);
    expect(await tokensSentTo(NEW_USER)).toEqual([]);
  });
});

describe("accepting the invitation", () => {
  it("sets the password, signs the user in and leaves the profile to fill in", async () => {
    await invite();
    const [token] = await tokensSentTo(NEW_USER);
    const checked = await request(app).post("/api/auth/reset-password/check").send({ token });
    expect(checked.body).toEqual({ message: "The link is valid.", purpose: "INVITATION" });

    const agent = request.agent(app);
    const response = await agent.post("/api/auth/reset-password").send({ token, password: OWN_PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: "Your password was set. Welcome to FoodWise.",
      purpose: "INVITATION",
      user: { email: NEW_USER, role: "STORE", must_change_password: false },
    });
    // Signed in by the same response: the profile is still empty.
    const me = await agent.get("/api/users/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: NEW_USER, first_name: null, business_name: null });

    const id = await userId(NEW_USER);
    const user = await pool.query("SELECT last_login_at FROM users WHERE id = $1", [id]);
    expect(user.rows[0].last_login_at).not.toBeNull();
    const events = await pool.query("SELECT event FROM account_events WHERE user_id = $1", [id]);
    expect(events.rows).toEqual([{ event: "INVITATION_ACCEPTED" }]);
    // No "password changed" notice for a first password.
    const notifications = await pool.query("SELECT type FROM notifications WHERE user_id = $1", [id]);
    expect(notifications.rows).toEqual([]);

    expect((await setPassword(token!)).body.error).toBe(INVALID_LINK);
    expect((await login(NEW_USER, OWN_PASSWORD)).get).toBeDefined();
  });

  it("works for 72 hours", async () => {
    await invite();
    const [token] = await tokensSentTo(NEW_USER);
    await pool.query("UPDATE auth_tokens SET expires_at = NOW() - interval '1 second'");
    const response = await setPassword(token!);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: INVALID_LINK, code: "INVALID_LINK" });
  });

  it("does not work for a blocked account", async () => {
    await invite();
    const [token] = await tokensSentTo(NEW_USER);
    await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [NEW_USER]);
    expect((await setPassword(token!)).body.error).toBe(INVALID_LINK);
  });
});

describe("resending the invitation", () => {
  it("sends a new link while the user never logged in, and the old one stops working", async () => {
    const created = await invite();
    const id = created.body.user.id;
    const response = await admin.post(`/api/admin/users/${id}/invitation`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Invitation sent." });

    const [first, second] = await tokensSentTo(NEW_USER);
    expect((await setPassword(first!)).body.error).toBe(INVALID_LINK);
    expect((await setPassword(second!)).status).toBe(200);
    expect(await adminActions(NEW_USER)).toEqual(["CREATE_USER", "SEND_INVITATION", "RESEND_INVITATION"]);
  });

  it("works for an account with a temporary password that never logged in", async () => {
    const created = await invite({ method: "PASSWORD", password: PASSWORD });
    expect((await admin.post(`/api/admin/users/${created.body.user.id}/invitation`)).status).toBe(200);
    expect(await tokensSentTo(NEW_USER)).toHaveLength(1);
  });

  it("is refused once the user has logged in", async () => {
    const created = await invite({ method: "PASSWORD", password: PASSWORD });
    await login(NEW_USER, PASSWORD);
    const response = await admin.post(`/api/admin/users/${created.body.user.id}/invitation`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("The user has already logged in.");
    const details = await admin.get(`/api/admin/users/${created.body.user.id}`);
    expect(details.body.user.last_login_at).not.toBeNull();
  });

  it("is refused for a blocked account and an unknown user, and only for admins", async () => {
    const created = await invite();
    const id = created.body.user.id;
    await pool.query("UPDATE users SET is_blocked = true WHERE id = $1", [id]);
    const blocked = await admin.post(`/api/admin/users/${id}/invitation`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toBe("A blocked account cannot get a link.");
    expect((await admin.post("/api/admin/users/999999/invitation")).status).toBe(404);
    expect((await admin.post("/api/admin/users/abc/invitation")).status).toBe(404);

    await insertUser(STORE, "STORE");
    const store = await login(STORE);
    expect((await store.post(`/api/admin/users/${id}/invitation`)).status).toBe(403);
  });
});

describe("an admin sending a password reset link", () => {
  it("emails the user a reset link, logs it and lets the user set a new password", async () => {
    await insertUser(STORE, "STORE");
    const id = await userId(STORE);
    const response = await admin.post(`/api/admin/users/${id}/password-reset-link`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Password reset link sent." });

    const [token] = await tokensSentTo(STORE, "PASSWORD_RESET");
    const { rows } = await pool.query("SELECT purpose, created_by FROM auth_tokens WHERE user_id = $1", [id]);
    expect(rows).toEqual([{ purpose: "PASSWORD_RESET", created_by: await userId(ADMIN) }]);
    expect(await adminActions(STORE)).toEqual(["SEND_PASSWORD_RESET_LINK"]);

    const reset = await setPassword(token!);
    expect(reset.body.purpose).toBe("PASSWORD_RESET");
    expect((await login(STORE, OWN_PASSWORD)).get).toBeDefined();
  });

  it("is refused for a blocked account", async () => {
    await insertUser(STORE, "STORE");
    await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [STORE]);
    const response = await admin.post(`/api/admin/users/${await userId(STORE)}/password-reset-link`);
    expect(response.status).toBe(400);
    expect(await tokensSentTo(STORE, "PASSWORD_RESET")).toEqual([]);
  });
});

describe("last login", () => {
  it("is recorded on every login", async () => {
    await insertUser(STORE, "STORE");
    await pool.query("UPDATE users SET last_login_at = NULL WHERE email = $1", [STORE]);
    await login(STORE);
    const { rows } = await pool.query("SELECT last_login_at FROM users WHERE email = $1", [STORE]);
    expect(rows[0].last_login_at).not.toBeNull();
  });
});
