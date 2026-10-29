// The e2e seed: empties every data table and creates a small, fixed set of accounts (see
// accounts.ts). Not the demo seed (server/src/scripts/seed.ts): only what the tests need.
import bcrypt from "bcryptjs";
import pg from "pg";
import { ACCOUNTS, PASSWORD } from "./accounts.js";

// Reference data filled by the migrations; everything else is emptied.
const KEPT_TABLES = ["pgmigrations", "cities", "plans", "topup_packages"];

// TRUNCATE on the wrong database would wipe it, so only a database named *_e2e_db is accepted.
const assertE2eDatabase = (databaseUrl: string) => {
  const name = new URL(databaseUrl).pathname.slice(1);
  if (!name.endsWith("_e2e_db")) {
    throw new Error(`Refusing to seed "${name}": the e2e database name must end in _e2e_db.`);
  }
};

export const seedE2e = async (databaseUrl: string) => {
  assertE2eDatabase(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");

    // TRUNCATE fires no row triggers, so the append-only credit ledger empties too.
    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> ALL($1)",
      [KEPT_TABLES],
    );
    const list = tables.rows.map((row) => `"${row.tablename}"`).join(", ");
    await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);

    const hash = await bcrypt.hash(PASSWORD, 10);
    const city = await client.query<{ id: number }>("SELECT id FROM cities WHERE name = 'Visoko'");
    const visokoId = city.rows[0]?.id;
    if (visokoId === undefined) throw new Error("City Visoko is missing; run the migrations first.");

    const { admin, store, restaurant } = ACCOUNTS;
    const adminRow = await client.query<{ id: number }>(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'ADMIN') RETURNING id`,
      [admin.firstName, admin.lastName, admin.email, hash],
    );
    const adminId = adminRow.rows[0]!.id;

    for (const [account, role, address] of [
      [store, "STORE", "Alije Izetbegovića 1"],
      [restaurant, "RESTAURANT", "Branilaca 2"],
    ] as const) {
      const user = await client.query<{ id: number }>(
        `INSERT INTO users
           (first_name, last_name, email, password_hash, role, business_name, city_id, address, phone,
            opening_hours, pickup_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '061 000 000', '08:00 - 20:00', '10:00 - 18:00')
         RETURNING id`,
        [account.firstName, account.lastName, account.email, hash, role, account.businessName, visokoId, address],
      );
      const userId = user.rows[0]!.id;

      // An approved Standard plan for the current credit month (months change at midnight
      // Europe/London, like creditMonth), granted the way grantPlan does it. No auto-renew, so
      // the renewal job leaves it alone. The trigger fills the request's credits and price.
      const request = await client.query<{ id: number; credits: number; period_month: string }>(
        `INSERT INTO credit_requests
           (user_id, request_type, plan_id, period_month, auto_renew, status, source, requested_by,
            reviewed_by, reviewed_at)
         VALUES ($1, 'SUBSCRIPTION', (SELECT id FROM plans WHERE name = 'Standard'),
                 date_trunc('month', now() AT TIME ZONE 'Europe/London')::date, false, 'APPROVED', 'USER', $1,
                 $2, now())
         RETURNING id, credits, period_month::text`,
        [userId, adminId],
      );
      const { id: requestId, credits, period_month: periodMonth } = request.rows[0]!;
      const subscription = await client.query<{ id: number }>(
        `INSERT INTO subscriptions (user_id, plan_id, credit_request_id, period_month, auto_renew)
         VALUES ($1, (SELECT id FROM plans WHERE name = 'Standard'), $2, $3, false) RETURNING id`,
        [userId, requestId, periodMonth],
      );
      await client.query(
        `INSERT INTO credit_transactions
           (user_id, subscription_id, period_month, amount, type, related_entity_type, related_entity_id,
            actor, created_by_user_id)
         VALUES ($1, $2, $3, $4, 'PLAN_GRANT', 'credit_request', $5, 'ADMIN', $6)`,
        [userId, subscription.rows[0]!.id, periodMonth, credits, requestId, adminId],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
};
