import pool from "../src/config/db.js";

// Every test file gets its own module graph, so each one closes its own pool.
afterAll(async () => {
  await pool.end();
});
