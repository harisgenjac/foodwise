import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { API_URL, APP_URL } from "./support/accounts.js";

// .env.e2e: DATABASE_URL (a *_e2e_db database), JWT_SECRET, PORT=3100,
// CLIENT_ORIGIN=http://localhost:4173, TRUST_PROXY=0, DISABLE_RATE_LIMITS=true. See docs/e2e.md.
loadEnv({ path: ".env.e2e", quiet: true });
if (!process.env.DATABASE_URL) {
  throw new Error("e2e/.env.e2e with DATABASE_URL is missing (see docs/e2e.md).");
}

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "never" }], ["list"]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: APP_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    timezoneId: "Europe/Sarajevo",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  // Playwright starts these before globalSetup, so the backend migrates before it starts and
  // globalSetup seeds afterwards. Both are built fresh every run on their own ports (dev uses
  // 3000/5173). The server gets the .env.e2e variables through process.env, which win over its .env.
  webServer: [
    {
      name: "backend",
      cwd: "../server",
      command: "npm run build && npx node-pg-migrate up && node dist/server.js",
      // An unauthenticated 401 counts as up.
      url: `${API_URL}/api/cities`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      name: "frontend",
      cwd: "../client",
      command: "npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort",
      url: APP_URL,
      env: { VITE_API_URL: API_URL },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
