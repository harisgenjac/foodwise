import pkg from 'pg';
import { APP_TIMEZONE } from '../utils/dates.js';
const { Pool } = pkg;

// Every session uses the app time zone, so CURRENT_DATE is the local business day.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c timezone=${APP_TIMEZONE}`,
});

export default pool;
