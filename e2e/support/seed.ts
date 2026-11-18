// The e2e seed: empties every data table and creates a small, fixed set of accounts (see
// accounts.ts). Not the local seeds (server/src/scripts/seed.ts, seedDemo.ts): only what the tests
// need. The accounts are written with the same helpers the local seeds use
// (server/src/scripts/seedAccounts.ts), so the two cannot drift apart.
import bcrypt from "bcryptjs";
import pg from "pg";
import {
  addCredits,
  cityLookup,
  everyDay,
  grantMonthlyPlan,
  insertAdmin,
  insertBusiness,
  insertCompany,
  wipeData,
} from "../../server/src/scripts/seedAccounts.js";
import { ACCOUNTS, PASSWORD } from "./accounts.js";

// Migrations and TRUNCATE on the wrong database would change or wipe it, so only a database named
// *_e2e_db is accepted: checked by the config before the web servers start, and again here.
export const assertE2eDatabase = (databaseUrl: string) => {
  const name = new URL(databaseUrl).pathname.slice(1);
  if (!name.endsWith("_e2e_db")) {
    throw new Error(`Refusing to run the e2e tests against "${name}": the database name must end in _e2e_db.`);
  }
};

type Business = { email: string; firstName: string; lastName: string; businessName: string };

// Open all day every day, so the store page says "open now" whenever a test runs; pickup
// 10:00–18:00 every day.
const OPEN_ALL_DAY = everyDay("00:00", "24:00");
const PICKUP_HOURS = everyDay("10:00", "18:00");
// The specs publish many products with the shared stores, and the chromium and iPhone projects
// both run some of them, so a Standard plan's 50 credits are not enough for a full run.
const EXTRA_CREDITS = 150;

export const seedE2e = async (databaseUrl: string) => {
  assertE2eDatabase(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await wipeData(client);

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const cityId = await cityLookup(client);
    const { admin, store, restaurant, brezaStore, tuzlaStore, blockStore, hq, branch } = ACCOUNTS;
    const adminId = await insertAdmin(client, {
      firstName: admin.firstName, lastName: admin.lastName, email: admin.email, passwordHash,
    });

    // The company: its headquarters login (no credits of its own) and one branch in Visoko.
    const { companyId } = await insertCompany(client, {
      name: hq.company,
      hq: { firstName: hq.firstName, lastName: hq.lastName, email: hq.email, phone: "061 000 001" },
      passwordHash,
    });

    const businesses: [Business, "STORE" | "RESTAURANT", string, string, number | null][] = [
      [store, "STORE", "Visoko", "Alije Izetbegovića 1", null],
      [restaurant, "RESTAURANT", "Visoko", "Branilaca 2", null],
      [brezaStore, "STORE", "Breza", "Bosanska 10", null],
      [tuzlaStore, "STORE", "Tuzla", "Turalibegova 5", null],
      [blockStore, "STORE", "Visoko", "Musala 9", null],
      [branch, "STORE", "Visoko", "Kakanjska 4", companyId],
    ];
    for (const [account, role, city, address, branchOf] of businesses) {
      // No pin: the specs that need one set it themselves (delivery, the location on the map).
      const id = await insertBusiness(client, {
        role, email: account.email, firstName: account.firstName, lastName: account.lastName,
        businessName: account.businessName, cityId: cityId(city), address, phone: "061 000 000", passwordHash,
        openingSchedule: OPEN_ALL_DAY, pickupSchedule: PICKUP_HOURS, companyId: branchOf,
      });
      // Only stores pay credits: an approved Standard plan for this month (no auto-renew, so the
      // renewal job leaves it alone) and the extra credits.
      if (role === "STORE") {
        await grantMonthlyPlan(client, { userId: id, planName: "Standard", autoRenew: false, adminId });
        await addCredits(client, { userId: id, amount: EXTRA_CREDITS, reason: "E2E: credits for a full run", adminId });
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
};
