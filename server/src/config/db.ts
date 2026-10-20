import pkg from 'pg';
import { APP_TIMEZONE } from '../utils/dates.js';
const { Pool, types } = pkg;

// DATE columns (expiry_date) stay plain YYYY-MM-DD strings. The default parser turns them into
// a JS Date at local midnight, which serializes as the previous day in UTC+ time zones.
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (value: string) => value);

// Every session uses the app time zone, so CURRENT_DATE is the local business day.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c timezone=${APP_TIMEZONE}`,
});

export default pool;
