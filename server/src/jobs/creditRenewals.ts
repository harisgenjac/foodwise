import cron from "node-cron";
import pool from "../config/db.js";
import { CREDIT_TIMEZONE, creditDay, creditMonth, nextMonth } from "../utils/creditTime.js";
import { notifyAdminsOfCreditRequest } from "../utils/notifications.js";

// Renewal requests are created this many days before the new month starts, so an admin has
// time to approve them before the user's credits run out with the month.
export const RENEWAL_DAYS_BEFORE = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

// One run, in one transaction:
// 1. Pending requests whose month has ended expire: they can no longer be granted.
// 2. In the last RENEWAL_DAYS_BEFORE days of a month, every active subscription with auto-renew
//    gets a pending request for the next month with the same plan, and the admins are told.
//    Skipped when the user already has next month's subscription, a pending subscription request
//    for it (e.g. a plan change), or an earlier renewal for it in any status: a renewal the user
//    withdrew or the admin rejected is not created again, so it happens only once.
//    Blocked users and plans that are no longer offered are not renewed.
export const runCreditRenewals = async (now = new Date()) => {
  const currentMonth = creditMonth(now);
  const upcomingMonth = nextMonth(currentMonth);
  const daysLeft = Math.round((Date.parse(upcomingMonth) - Date.parse(creditDay(now))) / DAY_MS);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const expired = await client.query(
      `UPDATE credit_requests SET status = 'EXPIRED'
       WHERE status = 'PENDING' AND period_month < $1`,
      [currentMonth],
    );

    let created: { id: number }[] = [];
    if (daysLeft <= RENEWAL_DAYS_BEFORE) {
      const renewals = await client.query<{ id: number }>(
        `INSERT INTO credit_requests (user_id, request_type, plan_id, period_month, auto_renew, source)
         SELECT subscriptions.user_id, 'SUBSCRIPTION', subscriptions.plan_id, $2, true, 'AUTO_RENEW'
         FROM subscriptions
         JOIN users ON users.id = subscriptions.user_id
         JOIN plans ON plans.id = subscriptions.plan_id
         WHERE subscriptions.period_month = $1
           AND subscriptions.status = 'ACTIVE'
           AND subscriptions.auto_renew
           AND users.is_blocked = false
           AND plans.is_active
           AND NOT EXISTS (
             SELECT 1 FROM subscriptions AS upcoming
             WHERE upcoming.user_id = subscriptions.user_id AND upcoming.period_month = $2
           )
           AND NOT EXISTS (
             SELECT 1 FROM credit_requests AS existing
             WHERE existing.user_id = subscriptions.user_id
               AND existing.period_month = $2
               AND existing.request_type = 'SUBSCRIPTION'
               AND (existing.status = 'PENDING' OR existing.source = 'AUTO_RENEW')
           )
         RETURNING id`,
        [currentMonth, upcomingMonth],
      );
      created = renewals.rows;
      for (const renewal of created) {
        await notifyAdminsOfCreditRequest(client, renewal.id, "New subscription renewal waiting for approval.");
      }
    }

    await client.query("COMMIT");
    if (created.length > 0 || (expired.rowCount ?? 0) > 0) {
      console.log(`Credit renewals: ${created.length} created, ${expired.rowCount ?? 0} expired.`);
    }
    return { created: created.length, expired: expired.rowCount ?? 0 };
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
