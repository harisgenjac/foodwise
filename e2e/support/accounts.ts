// The accounts the e2e seed creates (support/seed.ts) and where the setup project saves their
// sessions (tests/auth.setup.ts). Every seeded account uses PASSWORD.
export const PASSWORD = "E2e-pass-123";

export const API_URL = "http://localhost:3100";
export const APP_URL = "http://localhost:4173";

export const ACCOUNTS = {
  admin: { email: "e2e-admin@foodwise.test", firstName: "Ena", lastName: "Admin" },
  store: { email: "e2e-store@foodwise.test", firstName: "Sara", lastName: "Prodavac", businessName: "E2E Prodavnica" },
  restaurant: { email: "e2e-restaurant@foodwise.test", firstName: "Rijad", lastName: "Kuhar", businessName: "E2E Restoran" },
} as const;

export type SeededRole = keyof typeof ACCOUNTS;

export const storageState = (role: SeededRole) => `.auth/${role}.json`;

// A short id per test, appended to every name or email the test creates, so runs never collide.
export const runId = () => Date.now().toString(36);
