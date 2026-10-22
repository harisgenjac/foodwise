// Adds fake products and reservations for the users already in the database.
// Never creates, changes or deletes users, so existing logins keep working.
//
// Usage: npm run seed:fake [-- --products <per store> --reservations <per restaurant>]
import "dotenv/config";
import pool from "../config/db.js";
import { insertFakeData, printSummary } from "./fakeData.js";

const readArg = (name: string, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : Number(process.argv[index + 1]);
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
};

async function seedFakeData() {
  const client = await pool.connect();
  try {
    const stores = await client.query("SELECT id FROM users WHERE role = 'STORE'");
    if (stores.rows.length === 0) {
      console.log("There are no stores in the database. Register at least one store and run the script again.");
      return;
    }

    await client.query("BEGIN");
    const summary = await insertFakeData(client, {
      productsPerStore: readArg("products", 6),
      reservationsPerRestaurant: readArg("reservations", 4),
    });
    await client.query("COMMIT");

    printSummary(summary);
    if (summary.restaurants === 0) {
      console.log("There are no restaurants in the database, so no reservations were added.");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error while adding data:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedFakeData();
