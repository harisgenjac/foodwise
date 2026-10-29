import { seedE2e } from "./support/seed.js";

// Runs once per `playwright test`, after the web servers are up (Playwright starts webServer
// first, so the migrations run in the backend's command, see playwright.config.ts).
export default async function globalSetup() {
  await seedE2e(process.env.DATABASE_URL!);
}
