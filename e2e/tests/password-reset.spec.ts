import { expect, test } from "@playwright/test";
import { PASSWORD, runId } from "../support/accounts.js";
import { createStoreWithoutPlan } from "../support/api.js";
import { MAILPIT_URL, waitForEmail } from "../support/mailpit.js";
import { loginViaForm, submitLoginForm } from "../support/ui.js";

// Forgot password, end to end: the store asks for a link on the login page, opens it from the
// email in Mailpit, sets a new password, its other session is signed out, and it logs in with the
// new password. Uses its own account (createStoreWithoutPlan), so retries start fresh.
test.skip(
  !MAILPIT_URL && !process.env.CI,
  "Set MAILPIT_URL and EMAIL_PROVIDER=smtp in e2e/.env.e2e and start Mailpit to run this test.",
);

test("a store resets its forgotten password with the emailed link", async ({ browser, page }) => {
  expect(MAILPIT_URL, "MAILPIT_URL must be set in CI").toBeTruthy();
  const store = await createStoreWithoutPlan();
  const newPassword = `Nova-lozinka-${runId()}`;
  // A session from before the reset, e.g. on another device.
  const otherDevice = await browser.newContext({ storageState: store.storageState });

  await test.step("Prodavnica traži link na stranici za prijavu", async () => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Zaboravili ste lozinku?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel("Email", { exact: true }).fill(store.email);
    await page.getByRole("button", { name: "Pošalji link" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Ako postoji račun s ovim emailom, poslali smo link za novu lozinku.",
    );
  });

  const link = await test.step("Mailpit: email s linkom", async () => {
    const email = await waitForEmail(`to:${store.email} subject:"Postavite novu lozinku"`);
    expect(email.Text).toContain("Link vrijedi 1 sat");
    const url = /Postavi novu lozinku: (\S+)/.exec(email.Text)?.[1];
    expect(url).toMatch(/\/reset-password\?token=[A-Za-z0-9_-]{43}$/);
    return url!;
  });

  await test.step("Prodavnica otvara link i postavlja novu lozinku", async () => {
    await page.goto(link);
    await page.getByLabel("Nova lozinka", { exact: true }).fill(newPassword);
    await page.getByLabel("Ponovite novu lozinku").fill(newPassword);
    await page.getByRole("button", { name: "Spremi novu lozinku" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("status")).toHaveText("Lozinka je promijenjena. Prijavite se novom lozinkom.");
  });

  await test.step("Druga prijava je odjavljena, a link se ne može ponovo iskoristiti", async () => {
    const other = await otherDevice.newPage();
    await other.goto("/dashboard");
    await expect(other).toHaveURL(/\/login$/);
    await otherDevice.close();

    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Link više ne vrijedi" })).toBeVisible();
  });

  await test.step("Stara lozinka ne radi, nova radi", async () => {
    await submitLoginForm(page, store.email, PASSWORD);
    await expect(page.getByText("Pogrešan email ili lozinka.")).toBeVisible();
    await loginViaForm(page, store.email, newPassword);
  });

  await test.step("Mailpit: email da je lozinka promijenjena", async () => {
    const email = await waitForEmail(`to:${store.email} subject:"Vaša lozinka je promijenjena"`);
    expect(email.Text).toContain("Ako to niste bili vi");
  });
});

test("the forgot password page fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/forgot-password");
  const submit = page.getByRole("button", { name: "Pošalji link" });
  await expect(submit).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const back = await page.getByRole("link", { name: "Nazad na prijavu" }).boundingBox();
  expect(back!.height).toBeGreaterThanOrEqual(44);
});
