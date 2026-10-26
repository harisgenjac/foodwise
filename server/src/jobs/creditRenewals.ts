import cron from "node-cron";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { CREDIT_TIMEZONE, creditDay, creditMonth, nextMonth } from "../utils/creditTime.js";
import { createNotification, notifyAdminsOfCreditRequest } from "../utils/notifications.js";

// Renewal requests are created this many days before the new month starts, so an admin has
// time to approve them before the user's credits run out with the month.
export const RENEWAL_DAYS_BEFORE = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
// A user whose plan is no longer offered is told once per renewal window, not on every run.
const SKIPPED_NOTICE_DAYS = 7;

// Whether `now` falls in the last RENEWAL_DAYS_BEFORE credit days of its month.
export const isRenewalWindow = (now: Date) => {
  const upcomingMonth = nextMonth(creditMonth(now));
  const daysLeft = Math.round((Date.parse(upcomingMonth) - Date.parse(creditDay(now))) / DAY_MS);
  return daysLeft <= RENEWAL_DAYS_BEFORE;
};

// Creates next month's renewal requests (same plan, auto-renew on) for active subscriptions with
// auto-renew, then tells the admins and each user. Skipped when the user already has next month's
// subscription or a pending subscription request for it (e.g. a plan change), when an earlier
// renewal for that month exists, for blocked users and for plans that are no longer offered (those
// users are told instead).
// - The job runs it for everyone; an earlier renewal in any status blocks a new one, so a renewal
//   the user withdrew or the admin rejected is not created again.
// - `explicit`: the user just turned auto-renew on (`userId`). A renewal they withdrew earlier no
//   longer blocks, since they now ask for it; one the admin rejected still does.
// ON CONFLICT: a request the user sends at the same instant can win the one-pending-per-month
// index; that row is skipped instead of failing the whole run for everyone.
export const createRenewals = async (
  client: PoolClient,
  now: Date,
  { userId = null, explicit = false }: { userId?: number | null; explicit?: boolean } = {},
) => {
  const currentMonth = creditMonth(now);
  const upcomingMonth = nextMonth(currentMonth);
  const earlierRenewal = explicit
    ? "existing.source = 'AUTO_RENEW' AND existing.status <> 'CANCELLED'"
    : "existing.source = 'AUTO_RENEW'";
  const candidates = `
    FROM subscriptions
    JOIN users ON users.id = subscriptions.user_id
    JOIN plans ON plans.id = subscriptions.plan_id
    WHERE subscriptions.period_month = $1
      AND subscriptions.status = 'ACTIVE'
      AND subscriptions.auto_renew
      AND users.is_blocked = false
      AND ($3::int IS NULL OR subscriptions.user_id = $3)
      AND NOT EXISTS (
        SELECT 1 FROM subscriptions AS upcoming
        WHERE upcoming.user_id = subscriptions.user_id AND upcoming.period_month = $2
      )
      AND NOT EXISTS (
        SELECT 1 FROM credit_requests AS existing
        WHERE existing.user_id = subscriptions.user_id
          AND existing.period_month = $2
          AND existing.request_type = 'SUBSCRIPTION'
          AND (existing.status = 'PENDING' OR (${earlierRenewal}))
      )`;
  const params = [currentMonth, upcomingMonth, userId];

  const created = await client.query<{ id: number; user_id: number }>(
    `INSERT INTO credit_requests (user_id, request_type, plan_id, period_month, auto_renew, source)
     SELECT subscriptions.user_id, 'SUBSCRIPTION', subscriptions.plan_id, $2, true, 'AUTO_RENEW'
     ${candidates} AND plans.is_active
     ON CONFLICT DO NOTHING
     RETURNING id, user_id`,
    params,
  );
  for (const renewal of created.rows) {
    await notifyAdminsOfCreditRequest(client, renewal.id, "New subscription renewal waiting for approval.");
    await createNotification(client, {
      userId: renewal.user_id,
      type: "CREDIT_RENEWAL_CREATED",
      message: "Your subscription renewal request was sent for approval.",
      creditRequestId: renewal.id,
    });
  }

  const skipped = await client.query<{ user_id: number }>(
    `SELECT subscriptions.user_id ${candidates} AND NOT plans.is_active
       AND NOT EXISTS (
         SELECT 1 FROM notifications
         WHERE notifications.user_id = subscriptions.user_id
           AND notifications.type = 'CREDIT_RENEWAL_SKIPPED'
           AND notifications.created_at > NOW() - make_interval(days => $4)
       )`,
    [...params, SKIPPED_NOTICE_DAYS],
  );
  for (const row of skipped.rows) {
    await createNotification(client, {
      userId: row.user_id,
      type: "CREDIT_RENEWAL_SKIPPED",
      message: "Your subscription could not be renewed because its plan is no longer offered.",
    });
  }
  return created.rows;
};

// One run, in one transaction:
// 1. Pending requests whose month has ended expire (they can no longer be granted) and each user
//    is told.
// 2. In the renewal window, createRenewals for everyone.
export const runCreditRenewals = async (now = new Date()) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const expired = await client.query<{ id: number; user_id: number }>(
      `UPDATE credit_requests SET status = 'EXPIRED'
       WHERE status = 'PENDING' AND period_month < $1
       RETURNING id, user_id`,
      [creditMonth(now)],
    );
    for (const request of expired.rows) {
      await createNotification(client, {
        userId: request.user_id,
        type: "CREDIT_REQUEST_EXPIRED",
        message: "Your credit request expired before it was approved.",
        creditRequestId: request.id,
      });
    }

    const created = isRenewalWindow(now) ? await createRenewals(client, now) : [];

    await client.query("COMMIT");
    if (created.length > 0 || expired.rows.length > 0) {
      console.log(`Credit renewals: ${created.length} created, ${expired.rows.length} expired.`);
    }
    return { created: created.length, expired: expired.rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const runRenewals = async () => {
  try {
    await runCreditRenewals();
  } catch (error) {
    console.error("Error running credit renewal job:", error);
  }
};

export const startCreditRenewalJob = () => {
  // Catch up on a run missed while the server was down; every run is idempotent.
  runRenewals();
  cron.schedule("10 0 * * *", runRenewals, { timezone: CREDIT_TIMEZONE });
};
