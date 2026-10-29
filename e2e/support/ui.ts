// Small UI helpers shared by the specs. Kept as plain functions, not page objects.
import { expect, type Page } from "@playwright/test";

// Toasts are role="status", and so is the credit banner, so they are told apart by text.
export const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

// A dialog by its text, for the dialogs that have no accessible name (SubscribeModal,
// CreditRequestDecisionModal, the reserve dialog).
export const dialogWith = (page: Page, text: string) => page.getByRole("dialog").filter({ hasText: text });

export const loginViaForm = async (page: Page, email: string, password: string) => {
  await submitLoginForm(page, email, password);
  await expect(page).toHaveURL(/\/dashboard$/);
};

// The forced change of an admin-set temporary password, on My profile.
export const changeTemporaryPassword = async (page: Page, temporaryPassword: string, newPassword: string) => {
  await page.goto("/my-profile");
  await page.getByLabel("Trenutna lozinka").fill(temporaryPassword);
  await page.getByLabel("Nova lozinka", { exact: true }).fill(newPassword);
  await page.getByLabel("Ponovite novu lozinku").fill(newPassword);
  await page.getByRole("button", { name: "Promijeni lozinku" }).click();
  await expect(toast(page, "Lozinka je promijenjena.")).toBeVisible();
};

// Searches the marketplace by (part of) a product name and returns the matching cards. The search
// is debounced, so assert on the result (toHaveCount, toBeVisible), never read it right away.
export const searchMarketplace = async (page: Page, name: string) => {
  await page.goto("/browse-products");
  await page.getByPlaceholder("Pretraga po imenu").fill(name);
  return page.getByTestId("product-card").filter({ hasText: name });
};

// The product is not offered. The page keeps the previous list until the filtered answer arrives,
// so waiting for the empty state (rather than toHaveCount(0)) proves the search really ran.
export const expectNotInMarketplace = async (page: Page, name: string) => {
  const cards = await searchMarketplace(page, name);
  await expect(page.getByText("Nema rezultata", { exact: true })).toBeVisible();
  await expect(cards).toHaveCount(0);
};

// Submits the login form and stays wherever the app lands (a refused login stays on /login).
export const submitLoginForm = async (page: Page, email: string, password: string) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Lozinka").fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
};

// The Add product form with fixed values (bakery, 3 → 1.5 KM, 20 pieces, expiring tomorrow), for
// tests where publishing is a step rather than what is tested. Does not submit.
export const fillProductForm = async (page: Page, name: string) => {
  await page.getByLabel("Naziv proizvoda").fill(name);
  await page.getByRole("button", { name: "Pekarski proizvodi" }).click();
  await page.getByLabel("Originalna cijena").fill("3");
  await page.getByLabel("Snižena cijena").fill("1.5");
  await page.getByLabel("Količina").fill("20");
  await page.getByLabel("Jedinica mjere").selectOption({ label: "komad (kom)" });
  await page.getByRole("button", { name: "Sutra" }).click();
};

// The "Dostupno" figure on the Credits page. A full page load starts without credits (spinner),
// so the number is never a stale one from an earlier page.
const availableOnCreditsPage = async (page: Page) => {
  await page.goto("/credits");
  return page
    .getByRole("region", { name: "Ovaj mjesec" })
    .locator("div")
    .filter({ has: page.getByText("Dostupno", { exact: true }) })
    .locator("dd");
};

// The available credits from the Credits page, as a number.
export const availableCredits = async (page: Page) => {
  const value = await availableOnCreditsPage(page);
  await expect(value).toHaveText(/^\d+$/);
  return Number(await value.textContent());
};

export const expectAvailableCredits = async (page: Page, expected: number) => {
  await expect(await availableOnCreditsPage(page)).toHaveText(String(expected));
};
