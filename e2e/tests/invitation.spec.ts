import { expect, test } from "@playwright/test";
import { runId, storageState } from "../support/accounts.js";
import { MAILPIT_URL, waitForEmail } from "../support/mailpit.js";
import { loginViaForm, toast } from "../support/ui.js";

// The admin creates a store with an invitation (the default): the store opens the link from the
// email in Mailpit, sets its own password, lands on My profile signed in, and later logs in with
// that password. The admin's "Resend invitation" disappears after the first login.
test.skip(
  !MAILPIT_URL && !process.env.CI,
  "Set MAILPIT_URL and EMAIL_PROVIDER=smtp in e2e/.env.e2e and start Mailpit to run this test.",
);
test.use({ storageState: storageState("admin") });

test("a store invited by email sets its password and logs in", async ({ browser, page }) => {
  expect(MAILPIT_URL, "MAILPIT_URL must be set in CI").toBeTruthy();
  const id = runId();
  const email = `e2e-invite-${id}@foodwise.test`;
  const password = `Moja-lozinka-${id}`;

  await test.step("Admin kreira prodavnicu s pozivnicom", async () => {
    await page.goto("/admin/users/new");
    await page.getByRole("radio", { name: /Prodavnica/ }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await expect(page.getByRole("radio", { name: /Pošalji pozivnicu emailom/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Lozinka")).toHaveCount(0);
    await page.getByRole("button", { name: "Kreiraj nalog" }).click();
    await expect(toast(page, "Nalog je kreiran i pozivnica je poslana.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: email })).toBeVisible();
    await expect(page.getByText("Još se nije prijavio")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pošalji ponovo pozivnicu" })).toBeVisible();
  });

  const link = await test.step("Mailpit: pozivnica s linkom", async () => {
    const message = await waitForEmail(`to:${email} subject:"Pozivnica za FoodWise"`);
    expect(message.Text).toContain("Link vrijedi 72 sata");
    const url = /Postavi lozinku: (\S+)/.exec(message.Text)?.[1];
    expect(url).toMatch(/\/set-password\?token=[A-Za-z0-9_-]{43}$/);
    return url!;
  });

  const store = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const storePage = await store.newPage();

  await test.step("Prodavnica otvara link, postavlja lozinku i stiže na Moj profil", async () => {
    await storePage.goto(link);
    await expect(storePage.getByRole("heading", { name: "Postavite svoju lozinku" })).toBeVisible();
    await storePage.getByLabel("Nova lozinka", { exact: true }).fill(password);
    await storePage.getByLabel("Ponovite novu lozinku").fill(password);
    await storePage.getByRole("button", { name: "Postavi lozinku" }).click();
    await expect(storePage).toHaveURL(/\/my-profile$/);
    await expect(storePage.getByLabel("Email", { exact: true })).toHaveValue(email);
    // As today after the first login: the profile still has to be filled in.
    await expect(storePage.getByText(/Popunite obavezne podatke/)).toBeVisible();
  });

  await test.step("Link se ne može ponovo iskoristiti; prijava novom lozinkom radi", async () => {
    await store.clearCookies();
    await storePage.goto(link);
    await expect(storePage.getByRole("heading", { name: "Link više ne vrijedi" })).toBeVisible();
    await loginViaForm(storePage, email, password);
  });
  await store.close();

  await test.step("Admin više ne vidi Pošalji ponovo pozivnicu", async () => {
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: email })).toBeVisible();
    await expect(page.getByText("Još se nije prijavio")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pošalji ponovo pozivnicu" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pošalji link za novu lozinku" })).toBeVisible();
  });
});

test("the set password page fits a phone", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 375, height: 667 } });
  const page = await context.newPage();
  await page.goto("/set-password?token=not-a-real-token");
  await expect(page.getByRole("heading", { name: "Link više ne vrijedi" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.getByRole("link", { name: "Zatraži novi link" })).toBeInViewport({ ratio: 1 });
  await context.close();
});
