import 'dotenv/config';
import app from './app.js';
import { startExpirationJob } from './jobs/expireProducts.js';

const PORT = process.env.PORT || 3000;

startExpirationJob();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});