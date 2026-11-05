import 'dotenv/config';
import app from './app.js';
import { startExpirationJob } from './jobs/expireProducts.js';
import { startReminderJob } from './jobs/notificationReminders.js';
import { startCreditRenewalJob } from './jobs/creditRenewals.js';
import { EmailConfigError, loadEmailConfig, type EmailConfig } from './email/config.js';
import { startEmailWorker } from './email/queue.js';

const PORT = process.env.PORT || 3000;

// A wrong email setting stops the server before it listens (e.g. Resend outside production
// without EMAIL_REDIRECT_TO), so it is never noticed only when an email goes to a real person.
let emailConfig: EmailConfig;
try {
  emailConfig = loadEmailConfig(process.env);
} catch (error) {
  if (error instanceof EmailConfigError) {
    console.error(`Email configuration error: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
console.log(
  `Emails: ${emailConfig.provider}${emailConfig.redirectTo ? `, every email redirected to ${emailConfig.redirectTo}` : ''}`,
);

startExpirationJob();
startReminderJob();
startCreditRenewalJob();
startEmailWorker(emailConfig);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
