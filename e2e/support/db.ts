// Direct changes to the e2e database, only for a state the API cannot make (the API accepts only
// pickups from today on, so a missed pickup cannot be arranged through it). Everything else is
// arranged through the API (support/api.ts).
import pg from "pg";
import { assertE2eDatabase } from "./seed.js";

const withClient = async <T>(work: (client: pg.Client) => Promise<T>) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is missing (e2e/.env.e2e).");
  assertE2eDatabase(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
};

// Moves an order's pickup to two days ago at the same time, so an accepted order is overdue
// (Confirmed and its whole pickup day has passed).
export const makePickupOverdue = (orderId: number) =>
  withClient(async (client) => {
    const result = await client.query("UPDATE orders SET pickup_at = pickup_at - INTERVAL '3 days' WHERE id = $1", [orderId]);
    if (result.rowCount !== 1) throw new Error(`Order ${orderId} not found.`);
  });
