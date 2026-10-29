import { expect, request, test as setup } from "@playwright/test";
import { ACCOUNTS, API_URL, PASSWORD, storageState, type SeededRole } from "../support/accounts.js";

// Logs every seeded role in once through the API and saves the session cookie; the tests start
// from these sessions instead of the login form.
for (const role of Object.keys(ACCOUNTS) as SeededRole[]) {
  setup(`log in as ${role}`, async () => {
    const api = await request.newContext({ baseURL: API_URL });
    const response = await api.post("/api/auth/login", {
      data: { email: ACCOUNTS[role].email, password: PASSWORD },
    });
    expect(response.status()).toBe(200);
    await api.storageState({ path: storageState(role) });
    await api.dispose();
  });
}
