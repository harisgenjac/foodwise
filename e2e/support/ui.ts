// Small UI helpers shared by the specs. Kept as plain functions, not page objects.
import { expect, type Page } from "@playwright/test";
import { API_URL } from "./accounts.js";
import { sarajevoDate } from "./dates.js";

// Toasts are role="status", and so is the credit banner, so they are told apart by text.
export const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

// A dialog by its text. Every dialog is named by its title now (getByRole("dialog", { name })),
// so this is for matching on text further down in it.
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
  await page.getByLabel("Email", { exact: true }).fill(email);
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

// Empties the restaurant's cart through the API with the page's own session. The seeded
// restaurant is shared by the specs, so a spec that orders starts from an empty cart.
export const emptyCart = async (page: Page) => {
  const response = await page.request.delete(`${API_URL}/api/cart`);
  expect(response.ok(), `DELETE /api/cart → ${response.status()}`).toBe(true);
};

// Puts a product from its marketplace card into the cart ("Dodaj u korpu").
export const addToCart = async (page: Page, productName: string, quantity: string) => {
  const card = await searchMarketplace(page, productName);
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Dodaj u korpu" }).click();
  const dialog = page.getByRole("dialog", { name: /^(Dodaj u korpu|Izmijeni količinu u korpi)$/ });
  await dialog.getByLabel("Količina").fill(quantity);
  await dialog.getByRole("button", { name: /^(Dodaj u korpu|Sačuvaj)$/ }).click();
  await expect(dialog).toBeHidden();
};

// Opens the cart, picks the pickup (tomorrow at `time`) and sends the order. Returns the code
// from the confirmation (K7PM); the confirmation stays on screen for the caller to check.
export const checkout = async (page: Page, { time = "12:00", acceptPartial = true }: { time?: string; acceptPartial?: boolean } = {}) => {
  if (!page.url().endsWith("/cart")) await page.goto("/cart");
  await page.getByLabel("Datum preuzimanja").fill(sarajevoDate(1));
  await page.getByLabel("Datum preuzimanja").press("Enter");
  await page.getByLabel("Vrijeme preuzimanja").fill(time);
  const partial = page.getByRole("checkbox", { name: /Prihvatam djelimičnu isporuku/ });
  if (acceptPartial) await partial.check();
  else await partial.uncheck();
  await page.getByRole("button", { name: "Pošalji narudžbu" }).click();
};

// The code in the "Narudžba #K7PM je poslana" heading.
export const sentOrderCode = async (page: Page) => {
  const heading = page.getByRole("heading", { level: 1, name: /^Narudžba #[A-Z0-9]{4} je poslana$/ });
  await expect(heading).toBeVisible();
  return /#([A-Z0-9]{4})/.exec((await heading.textContent()) ?? "")![1]!;
};

// The restaurant orders one product: an empty cart, the product added from its marketplace card,
// and the checkout (pickup tomorrow at `time`). Returns the order's code.
export const orderFromMarketplace = async (
  page: Page,
  productName: string,
  { quantity, time = "12:00", acceptPartial = true }: { quantity: string; time?: string; acceptPartial?: boolean },
) => {
  await emptyCart(page);
  await addToCart(page, productName, quantity);
  await checkout(page, { time, acceptPartial });
  return sentOrderCode(page);
};

// The store's card of an order on Narudžbe, found by a product in it.
export const storeOrderCard = async (page: Page, productName: string) => {
  await page.goto("/orders");
  await page.getByPlaceholder("Pretraga po proizvodu").fill(productName);
  const card = page.getByTestId("order-card").filter({ hasText: productName });
  await expect(card).toHaveCount(1);
  return card;
};
