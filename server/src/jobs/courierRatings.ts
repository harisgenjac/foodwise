import cron from "node-cron";
import { retryCourierRatings } from "../services/courierRatings.js";
import { APP_TIMEZONE } from "../utils/dates.js";

let running = false;

// Sends the courier ratings the delivery provider has not received yet (services/courierRatings.ts).
// One run at a time.
const runRetry = async () => {
  if (running) return;
  running = true;
  try {
    const sent = await retryCourierRatings();
    if (sent > 0) console.log(`Sent ${sent} courier ratings to the delivery provider.`);
  } catch (error) {
    console.error("Error running the courier rating retry job:", error);
  } finally {
    running = false;
  }
};

// From server.ts only (tests call retryCourierRatings): every 10 minutes.
export const startCourierRatingJob = () => {
  cron.schedule("*/10 * * * *", runRetry, { timezone: APP_TIMEZONE });
};
