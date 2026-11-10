import type { PoolClient } from "pg";
import pool from "../config/db.js";

// Runs `work` in a transaction on its own client: COMMIT on success, ROLLBACK on any error, which
// is rethrown for the caller to answer (an HttpError carries its status).
export const inTransaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
