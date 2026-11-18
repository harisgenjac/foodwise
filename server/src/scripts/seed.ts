// npm run seed: replaces ALL data with the accounts only (seedBase.ts), fast: the admins, Bingo
// d.o.o. with its headquarters and branches, and the stores and restaurants in Sarajevo, Visoko,
// Kakanj, Zenica and Tuzla, each with a complete profile and this month's plan for every store.
// No products, orders or other activity: `npm run seed:demo` adds those.
import "dotenv/config";
import pool from "../config/db.js";
import { createBaseAccounts, printLogins } from "./seedBase.js";
import { wipeData } from "./seedAccounts.js";

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Deleting existing data...");
    await wipeData(client);
    console.log("Creating accounts...");
    const accounts = await createBaseAccounts(client);
    await client.query("COMMIT");
    console.log(
      `Created ${accounts.admins.length} admins, ${accounts.companies.size} ${accounts.companies.size === 1 ? "company" : "companies"}, ` +
        `${accounts.stores.length} stores and ${accounts.restaurants.length} restaurants.`,
    );
    printLogins(accounts);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error while seeding:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
