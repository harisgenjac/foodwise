import 'dotenv/config';
import app from './src/app.js';
import { startExpirationJob } from './src/jobs/expireProducts.js';

const PORT = process.env.PORT || 3000;

startExpirationJob();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});