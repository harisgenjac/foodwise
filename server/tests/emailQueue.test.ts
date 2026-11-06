import pool from "../src/config/db.js";
import {
  enqueueNotificationEmails,
  MAX_EMAIL_ATTEMPTS,
  processEmailQueue,
  RETRY_DELAYS_SECONDS,
  retryDelaySeconds,
  startEmailWorker,
} from "../src/email/queue.js";
import { loadEmailConfig } from "../src/email/config.js";
import { createNotification } from "../src/utils/notifications.js";
import type { EmailMessage, EmailTransport } from "../src/email/transports.js";
import {
  cleanupUsers,
  createProduct,
  futurePickup,
  insertUser,
  registerAndLogin,
  reserve,
  userId,
  type Agent,
} from "./helpers.js";

const STORE = "email-queue-store@test.com";
const RESTAURANT = "email-queue-restaurant@test.com";
const BLOCKED_STORE = "email-queue-blocked@test.com";
const EMAILS = [STORE, RESTAURANT, BLOCKED_STORE];

const CONFIG = { from: "FoodWise <no-reply@example.com>", redirectTo: null, appUrl: "https://app.example.com" };

interface QueueRow {
  id: number;
  user_id: number | null;
  recipient: string;
  template: string;
  data: Record<string, unknown>;
  language: string;
  status: string;
  attempts: number;
  next_attempt_at: Date;
  locked_at: Date | null;
  last_error: string | null;
  sent_at: Date | null;
}

const queueRows = async (): Promise<QueueRow[]> =>
  (await pool.query<QueueRow>("SELECT * FROM email_queue ORDER BY id")).rows;

// A transport that records what it was given, or fails with `error`.
const fakeTransport = (error?: Error) => {
  const sent: EmailMessage[] = [];
  const send = vi.fn(async (message: EmailMessage) => {
    if (error) throw error;
    sent.push(message);
  });
  const transport: EmailTransport = { name: "smtp", send };
  return { transport, sent, send };
};

const secondsLater = (from: Date, seconds: number) => new Date(from.getTime() + seconds * 1000);

let store: Agent;
let restaurant: Agent;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  // Only this file's rows: the files run one at a time and every other file cleans up its users.
  await pool.query("DELETE FROM email_queue");
  store = await registerAndLogin(STORE, "STORE");
  restaurant = await registerAndLogin(RESTAURANT, "RESTAURANT");
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  consoleError.mockRestore();
  await cleanupUsers(EMAILS);
});

const reserveChicken = async (quantity = 4) => {
  const product = await createProduct(store, { name: "Piletina", unit: "kg" });
  const reservationId = await reserve(restaurant, product.id, quantity);
  return { product, reservationId };
};

describe("queueing", () => {
  it("queues one email to the store with the reservation, in the same transaction as the notification", async () => {
    const { product, reservationId } = await reserveChicken();
    const rows = await queueRows();
    expect(rows).toHaveLength(1);
    const pickupDay = futurePickup().slice(0, 10);
    expect(rows[0]).toMatchObject({
      user_id: await userId(STORE),
      recipient: STORE,
      template: "RESERVATION_CREATED",
      language: "bs",
      status: "PENDING",
      attempts: 0,
      last_error: null,
      sent_at: null,
      data: {
        recipientRole: "STORE",
        reservationId,
        productId: product.id,
        donationId: null,
        creditRequestId: null,
        productName: "Piletina",
        quantity: "4",
        unit: "kg",
        restaurantName: "Test Business",
        storeName: "Test Business",
        pickupAt: `${pickupDay}T10:00`,
        details: null,
      },
    });
    const notification = await pool.query(
      "SELECT notifications.id FROM notifications WHERE notifications.reservation_id = $1 AND notifications.type = 'RESERVATION_CREATED'",
      [reservationId],
    );
    expect(notification.rowCount).toBe(1);
  });

  it("queues nothing when the action is rolled back", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await createNotification(client, { userId: await userId(STORE), type: "PRODUCT_EXPIRED", message: "Expired" });
      expect(await queueRows()).toEqual([]);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect(await queueRows()).toEqual([]);
  });

  it("queues the email of every later notification too", async () => {
    const { reservationId } = await reserveChicken();
    expect((await store.patch(`/api/reservations/${reservationId}/accept`)).status).toBe(200);
    const rows = await queueRows();
    expect(rows.map((row) => [row.template, row.recipient])).toEqual([
      ["RESERVATION_CREATED", STORE],
      ["RESERVATION_ACCEPTED", RESTAURANT],
    ]);
  });

  it("queues nothing for a blocked user, an untyped notification or no notifications", async () => {
    const { reservationId } = await reserveChicken();
    await pool.query("DELETE FROM email_queue");
    await insertUser(BLOCKED_STORE, "STORE", "Blocked Store");
    const blockedId = await userId(BLOCKED_STORE);
    await pool.query("UPDATE users SET is_blocked = true WHERE id = $1", [blockedId]);
    await createNotification(pool, {
      userId: blockedId,
      type: "RESERVATION_CREATED",
      message: "New reservation request",
      reservationId,
    });
    // Rows from before notification types existed have no type.
    const untyped = await pool.query<{ id: number }>(
      "INSERT INTO notifications (user_id, message) VALUES ($1, 'Stara obavijest') RETURNING id",
      [await userId(STORE)],
    );
    expect(await enqueueNotificationEmails(pool, [untyped.rows[0]!.id])).toBe(0);
    expect(await enqueueNotificationEmails(pool, [])).toBe(0);
    expect(await queueRows()).toEqual([]);
  });
});

describe("sending", () => {
  it("sends a due email and marks it SENT", async () => {
    const { reservationId } = await reserveChicken();
    const { transport, sent, send } = fakeTransport();
    const now = new Date();

    expect(await processEmailQueue({ transport, config: CONFIG, now })).toEqual({ sent: 1, retrying: 0, failed: 0, skipped: 0 });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: CONFIG.from,
      to: STORE,
      subject: "Nova rezervacija: 4 kg Piletina",
    });
    expect(sent[0]!.html).toContain(`https://app.example.com/reservation/${reservationId}`);
    expect(sent[0]!.text).toContain(`https://app.example.com/reservation/${reservationId}`);
    const [row] = await queueRows();
    expect(send).toHaveBeenCalledWith(expect.anything(), { idempotencyKey: `foodwise-email-${row!.id}` });
    expect(row).toMatchObject({ status: "SENT", attempts: 1, last_error: null, locked_at: null });
    expect(row!.sent_at?.getTime()).toBe(now.getTime());

    // Nothing is sent twice.
    expect(await processEmailQueue({ transport, config: CONFIG })).toEqual({ sent: 0, retrying: 0, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
  });

  it("sends to EMAIL_REDIRECT_TO with the real recipient in the subject", async () => {
    await reserveChicken();
    const { transport, sent } = fakeTransport();
    await processEmailQueue({ transport, config: { ...CONFIG, redirectTo: "inbox@example.com" } });
    expect(sent[0]).toMatchObject({
      to: "inbox@example.com",
      subject: `[to: ${STORE}] Nova rezervacija: 4 kg Piletina`,
    });
    // The queue keeps the real recipient.
    expect((await queueRows())[0]!.recipient).toBe(STORE);
  });

  it("renders the email in the row's language", async () => {
    await reserveChicken();
    await pool.query("UPDATE email_queue SET language = 'en'");
    const { transport, sent } = fakeTransport();
    await processEmailQueue({ transport, config: CONFIG });
    expect(sent[0]!.subject).toBe("New reservation: 4 kg Piletina");
  });

  it("does not send an email whose next attempt is later", async () => {
    await reserveChicken();
    const now = new Date();
    await pool.query("UPDATE email_queue SET next_attempt_at = $1", [secondsLater(now, 60)]);
    const { transport, sent } = fakeTransport();
    await processEmailQueue({ transport, config: CONFIG, now });
    expect(sent).toHaveLength(0);
    await processEmailQueue({ transport, config: CONFIG, now: secondsLater(now, 61) });
    expect(sent).toHaveLength(1);
  });

  it("sends at most one batch per pass, oldest first", async () => {
    const product = await createProduct(store, { name: "Mlijeko", unit: "l", quantity: 10 });
    const first = await reserve(restaurant, product.id, 1);
    const second = await reserve(restaurant, product.id, 1);
    const { transport, sent } = fakeTransport();
    await processEmailQueue({ transport, config: CONFIG, batchSize: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain(`/reservation/${first}`);
    await processEmailQueue({ transport, config: CONFIG, batchSize: 1 });
    expect(sent[1]!.text).toContain(`/reservation/${second}`);
  });
});

describe("retries", () => {
  it("waits longer after every failure and gives up after the last attempt", async () => {
    await reserveChicken();
    const { transport, send } = fakeTransport(new Error("connect ECONNREFUSED 127.0.0.1:1025"));
    let now = new Date();

    for (let attempt = 1; attempt < MAX_EMAIL_ATTEMPTS; attempt += 1) {
      expect(await processEmailQueue({ transport, config: CONFIG, now })).toEqual({ sent: 0, retrying: 1, failed: 0, skipped: 0 });
      const [row] = await queueRows();
      const delay = RETRY_DELAYS_SECONDS[attempt - 1]!;
      expect(row).toMatchObject({
        status: "PENDING",
        attempts: attempt,
        last_error: "connect ECONNREFUSED 127.0.0.1:1025",
        locked_at: null,
      });
      expect(row!.next_attempt_at.getTime()).toBe(secondsLater(now, delay).getTime());

      // Not before its time.
      await processEmailQueue({ transport, config: CONFIG, now: secondsLater(now, delay - 1) });
      expect(send).toHaveBeenCalledTimes(attempt);
      now = secondsLater(now, delay);
    }

    expect(await processEmailQueue({ transport, config: CONFIG, now })).toEqual({ sent: 0, retrying: 0, failed: 1, skipped: 0 });
    const [row] = await queueRows();
    expect(row).toMatchObject({ status: "FAILED", attempts: MAX_EMAIL_ATTEMPTS, sent_at: null });
    expect(send).toHaveBeenCalledTimes(MAX_EMAIL_ATTEMPTS);

    // A FAILED email is never tried again.
    await processEmailQueue({ transport, config: CONFIG, now: secondsLater(now, 86_400) });
    expect(send).toHaveBeenCalledTimes(MAX_EMAIL_ATTEMPTS);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("failed for good after 5 attempt(s)"));
  });

  it("sends on a later attempt after a failure", async () => {
    await reserveChicken();
    const now = new Date();
    await processEmailQueue({ transport: fakeTransport(new Error("timeout")).transport, config: CONFIG, now });
    const { transport, sent } = fakeTransport();
    await processEmailQueue({ transport, config: CONFIG, now: secondsLater(now, RETRY_DELAYS_SECONDS[0]) });
    expect(sent).toHaveLength(1);
    expect((await queueRows())[0]).toMatchObject({ status: "SENT", attempts: 2, last_error: null });
  });

  it("uses the retry delays in order", () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([60, 300, 1800, 7200]);
  });

  it("fails at once for an unknown template or data that does not fit", async () => {
    await reserveChicken();
    await reserveChicken();
    const [first, second] = await queueRows();
    await pool.query("UPDATE email_queue SET template = 'NO_SUCH_TEMPLATE' WHERE id = $1", [first!.id]);
    await pool.query(`UPDATE email_queue SET data = '{"reservationId": "x"}' WHERE id = $1`, [second!.id]);
    const { transport, send } = fakeTransport();
    expect(await processEmailQueue({ transport, config: CONFIG })).toEqual({ sent: 0, retrying: 0, failed: 2, skipped: 0 });
    expect(send).not.toHaveBeenCalled();
    const rows = await queueRows();
    expect(rows.map((row) => [row.status, row.attempts])).toEqual([
      ["FAILED", 1],
      ["FAILED", 1],
    ]);
    expect(rows[0]!.last_error).toBe("The stored data does not match the NO_SUCH_TEMPLATE email template.");
  });

  it("gives an email back to the queue when its worker stopped mid-send", async () => {
    await reserveChicken();
    const now = new Date();
    await pool.query("UPDATE email_queue SET status = 'SENDING', attempts = 1, locked_at = $1", [
      secondsLater(now, -11 * 60),
    ]);
    const { transport, sent } = fakeTransport();
    await processEmailQueue({ transport, config: CONFIG, now });
    expect(sent).toHaveLength(1);
    expect((await queueRows())[0]).toMatchObject({ status: "SENT", attempts: 2 });
  });

  it("leaves an email that is being sent right now alone", async () => {
    await reserveChicken();
    const now = new Date();
    await pool.query("UPDATE email_queue SET status = 'SENDING', attempts = 1, locked_at = $1", [
      secondsLater(now, -60),
    ]);
    const { transport, sent } = fakeTransport();
    await processEmailQueue({ transport, config: CONFIG, now });
    expect(sent).toHaveLength(0);
    expect((await queueRows())[0]!.status).toBe("SENDING");
  });
});

describe("a failing email service never breaks the reservation", () => {
  it("keeps the reservation and the notification", async () => {
    const { reservationId } = await reserveChicken();
    const { transport } = fakeTransport(new Error("Resend responded with 500: Internal error"));
    await processEmailQueue({ transport, config: CONFIG });

    const reservation = await restaurant.get(`/api/reservations/${reservationId}`);
    expect(reservation.status).toBe(200);
    expect(reservation.body.reservation.status).toBe("Pending");
    const notifications = await store.get("/api/notifications");
    expect(notifications.body.notifications.map((n: { type: string }) => n.type)).toContain("RESERVATION_CREATED");
    // The store can still accept it.
    expect((await store.patch(`/api/reservations/${reservationId}/accept`)).status).toBe(200);
    expect((await queueRows())[0]).toMatchObject({ status: "PENDING", attempts: 1 });
  });

  it("the worker logs a pass that fails and keeps running", async () => {
    const transport: EmailTransport = { name: "log", send: vi.fn() };
    const query = vi.spyOn(pool, "query").mockRejectedValueOnce(new Error("database is down") as never);
    const worker = startEmailWorker(loadEmailConfig({}), transport);
    try {
      await vi.waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith("Error while processing the email queue:", expect.any(Error)),
      );
    } finally {
      worker.stop();
      query.mockRestore();
    }
    // The next pass works again.
    await reserveChicken();
    await worker.tick();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
});
