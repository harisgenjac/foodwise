import 'dotenv/config';
import app from './app.js';
import { startExpirationJob } from './jobs/expireProducts.js';
import { startReminderJob } from './jobs/notificationReminders.js';
import { startCreditRenewalJob } from './jobs/creditRenewals.js';

const PORT = process.env.PORT || 3000;

startExpirationJob();
startReminderJob();
startCreditRenewalJob();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
