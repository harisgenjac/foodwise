// The accounts the e2e seed creates (support/seed.ts) and where the setup project saves their
// sessions (tests/auth.setup.ts). Every seeded account uses PASSWORD.
import { fileURLToPath } from "node:url";

export const PASSWORD = "E2e-pass-123";

export const API_URL = "http://localhost:3100";
export const APP_URL = "http://localhost:4173";

export const ACCOUNTS = {
  admin: { email: "e2e-admin@foodwise.test", firstName: "Ena", lastName: "Admin" },
  store: { email: "e2e-store@foodwise.test", firstName: "Sara", lastName: "Prodavac", businessName: "E2E Prodavnica" },
  restaurant: { email: "e2e-restaurant@foodwise.test", firstName: "Rijad", lastName: "Kuhar", businessName: "E2E Restoran" },
  // Nearby offers (nearby-offers.spec.ts): 7 km and 73 km from the restaurant in Visoko.
  brezaStore: { email: "e2e-breza@foodwise.test", firstName: "Belma", lastName: "Breza", businessName: "E2E Breza Market" },
  tuzlaStore: { email: "e2e-tuzla@foodwise.test", firstName: "Tarik", lastName: "Tuzla", businessName: "E2E Tuzla Market" },
  // Only block-store.spec.ts uses it: it is blocked and unblocked there.
  blockStore: { email: "e2e-block@foodwise.test", firstName: "Bakir", lastName: "Blokada", businessName: "E2E Blokada" },
  // Company "E2E Lanac": its headquarters login and its one branch in Visoko (branch-deactivation.spec.ts).
  hq: { email: "e2e-hq@foodwise.test", firstName: "Hana", lastName: "Centrala", company: "E2E Lanac" },
  branch: { email: "e2e-branch@foodwise.test", firstName: "Benjamin", lastName: "Poslovnica", businessName: "E2E Lanac Visoko" },
} as const;

export type SeededRole = keyof typeof ACCOUNTS;

// e2e/.auth/<role>.json, whatever the working directory (the VS Code extension runs from the
// workspace root).
export const storageState = (role: SeededRole) => fileURLToPath(new URL(`../.auth/${role}.json`, import.meta.url));

// A short id per test, appended to every name or email the test creates, so runs never collide.
export const runId = () => Date.now().toString(36);

// "<prefix> <runId>", e.g. uniqueName("E2E Mlijeko") → "E2E Mlijeko mh3k2x9a".
export const uniqueName = (prefix: string) => `${prefix} ${runId()}`;
