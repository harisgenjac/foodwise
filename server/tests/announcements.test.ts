import pool from "../src/config/db.js";
import { type Agent, cleanupUsers, registerAndLogin, userId } from "./helpers.js";

const ADMIN = "announcements-admin@test.com";
const STORE = "announcements-store@test.com";
const RESTAURANT = "announcements-restaurant@test.com";
const OTHER_RESTAURANT = "announcements-restaurant-b@test.com";
const BLOCKED = "announcements-blocked@test.com";
const LATE = "announcements-late@test.com";
const EMAILS = [ADMIN, STORE, RESTAURANT, OTHER_RESTAURANT, BLOCKED, LATE];

let admin: Agent;
let store: Agent;
let restaurant: Agent;

const payload = (overrides: Record<string, unknown> = {}) => ({
  audience: "RESTAURANT",
  title_bs: "Novi rok za preuzimanje",
  body_bs: "Od ponedjeljka se preuzima do 20h.",
  title_en: "New pickup deadline",
  body_en: "From Monday pickups close at 8pm.",
  ...overrides,
});

const announce = async (overrides: Record<string, unknown> = {}) => {
  const response = await admin.post("/api/admin/announcements").send(payload(overrides));
  if (response.status !== 201) {
    throw new Error(`Announcing failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body as { announcement: { id: number }; recipients: number };
};

const notificationsOf = async (email: string) =>
  (
    await pool.query(
      `SELECT notifications.type, notifications.announcement_id
       FROM notifications JOIN users ON notifications.user_id = users.id
       WHERE users.email = $1 AND notifications.type = 'PLATFORM_ANNOUNCEMENT'`,
      [email],
    )
  ).rows;

const activeIds = async (agent: Agent) =>
  (await agent.get("/api/announcements/active")).body.announcements.map((row: { id: number }) => row.id);

describe("Platform announcements", () => {
  beforeEach(async () => {
    admin = await registerAndLogin(ADMIN, "ADMIN");
    store = await registerAndLogin(STORE, "STORE");
    restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  });

  afterEach(async () => {
    await cleanupUsers(EMAILS);
  });

  it("notifies only the chosen audience, never blocked users or admins", async () => {
    await registerAndLogin(OTHER_RESTAURANT, "RESTAURANT");
    await registerAndLogin(BLOCKED, "RESTAURANT");
    await pool.query("UPDATE users SET is_blocked = true WHERE email = $1", [BLOCKED]);

    const { announcement, recipients } = await announce();
    // Other test data in the database may hold more restaurants, so count ours.
    expect(recipients).toBeGreaterThanOrEqual(2);
    expect(await notificationsOf(RESTAURANT)).toEqual([
      { type: "PLATFORM_ANNOUNCEMENT", announcement_id: announcement.id },
    ]);
    expect(await notificationsOf(OTHER_RESTAURANT)).toHaveLength(1);
    expect(await notificationsOf(BLOCKED)).toEqual([]);
    expect(await notificationsOf(STORE)).toEqual([]);
    expect(await notificationsOf(ADMIN)).toEqual([]);

    expect(await activeIds(restaurant)).toContain(announcement.id);
    expect(await activeIds(store)).not.toContain(announcement.id);
  });

  it("reaches both roles with ALL and joins the titles into the notification list", async () => {
    const { announcement } = await announce({ audience: "ALL", title_en: "", body_en: "" });
    expect(await activeIds(store)).toContain(announcement.id);
    expect(await activeIds(restaurant)).toContain(announcement.id);

    const listed = await store.get("/api/notifications");
    expect(listed.body.notifications[0]).toMatchObject({
      type: "PLATFORM_ANNOUNCEMENT",
      announcement_id: announcement.id,
      announcement_title_bs: "Novi rok za preuzimanje",
      announcement_title_en: null,
    });
  });

  it("validates the announcement", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ audience: "ADMIN" }, "Publika nije ispravna."],
      [{ title_bs: "  " }, "Naslov i tekst su obavezni."],
      [{ body_en: "" }, "Za engleski prevod unesite i naslov i tekst."],
      [{ title_bs: "x".repeat(121) }, "Naslov može imati najviše 120 znakova."],
      [{ body_bs: "x".repeat(1001) }, "Tekst može imati najviše 1000 znakova."],
      [{ expires_at: "2020-01-01T10:00:00.000Z" }, "Datum isteka mora biti u budućnosti."],
      [{ expires_at: "sutra" }, "Datum isteka mora biti u budućnosti."],
    ];
    for (const [overrides, message] of cases) {
      const response = await admin.post("/api/admin/announcements").send(payload(overrides));
      expect(response.status, message).toBe(400);
      expect(response.body.error).toBe(message);
    }
    expect((await store.post("/api/admin/announcements").send(payload())).status).toBe(403);
  });

  it("hides an announcement after it expires or the admin ends it", async () => {
    const { announcement: expiring } = await announce({ expires_at: new Date(Date.now() + 60_000).toISOString() });
    const { announcement: ended } = await announce();
    expect(await activeIds(restaurant)).toEqual(expect.arrayContaining([expiring.id, ended.id]));

    await pool.query("UPDATE announcements SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [expiring.id]);
    const end = await admin.post(`/api/admin/announcements/${ended.id}/end`);
    expect(end.status).toBe(200);
    expect(end.body.message).toBe("Obavještenje je završeno.");

    const active = await activeIds(restaurant);
    expect(active).not.toContain(expiring.id);
    expect(active).not.toContain(ended.id);

    for (const id of [expiring.id, ended.id]) {
      const again = await admin.post(`/api/admin/announcements/${id}/end`);
      expect(again.status).toBe(400);
      expect(again.body.error).toBe("Obavještenje je već završeno.");
    }
    expect((await admin.post("/api/admin/announcements/999999/end")).status).toBe(404);
  });

  it("lets each user dismiss it once without hiding it for others", async () => {
    const other = await registerAndLogin(OTHER_RESTAURANT, "RESTAURANT");
    const { announcement } = await announce();

    for (let i = 0; i < 2; i++) {
      const response = await restaurant.post(`/api/announcements/${announcement.id}/dismiss`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Obavještenje je zatvoreno.");
    }
    expect(await activeIds(restaurant)).not.toContain(announcement.id);
    expect(await activeIds(other)).toContain(announcement.id);

    // A store cannot dismiss an announcement meant for restaurants.
    expect((await store.post(`/api/announcements/${announcement.id}/dismiss`)).status).toBe(404);
    expect((await restaurant.post("/api/announcements/999999/dismiss")).status).toBe(404);
  });

  it("does not show older announcements to an account created later", async () => {
    const { announcement } = await announce();
    const late = await registerAndLogin(LATE, "RESTAURANT");
    expect(await activeIds(late)).not.toContain(announcement.id);
  });

  it("lists announcements for admins with counts and logs create and end", async () => {
    const { announcement } = await announce();
    await restaurant.post(`/api/announcements/${announcement.id}/dismiss`);
    await admin.post(`/api/admin/announcements/${announcement.id}/end`);

    const list = await admin.get("/api/admin/announcements");
    expect(list.status).toBe(200);
    const row = list.body.announcements.find((item: { id: number }) => item.id === announcement.id);
    expect(row).toMatchObject({ admin_email: ADMIN, is_active: false, dismissed: 1 });
    expect(row.recipients).toBeGreaterThanOrEqual(1);

    const log = await admin.get(`/api/admin/actions?admin_id=${await userId(ADMIN)}`);
    expect(log.body.actions.map((item: { action: string }) => item.action)).toEqual([
      "END_ANNOUNCEMENT",
      "CREATE_ANNOUNCEMENT",
    ]);
    expect(log.body.actions[0]).toMatchObject({
      target_announcement_id: announcement.id,
      announcement_title: "Novi rok za preuzimanje",
    });

    expect((await admin.get("/api/announcements/active")).status).toBe(403);
  });
});
