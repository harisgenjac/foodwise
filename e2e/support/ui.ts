// Small UI helpers shared by the specs. Kept as plain functions, not page objects.
import { expect, type Page } from "@playwright/test";
import { API_URL } from "./accounts.js";
import { sarajevoDate } from "./dates.js";

// A dialog that closes goes back over its own history entry (so the phone's Back closes dialogs,
// see useOverlay in the client). That Back runs a moment later, and a navigation started before it
// lands is aborted (net::ERR_ABORTED). This waits until the history has no more overlay entries
// than overlays are open (a dialog left open on purpose keeps its entry).
export const settleOverlays = (page: Page) =>
  page.waitForFunction(() => {
    const depth = (window.history.state as { overlayDepth?: number } | null)?.overlayDepth ?? 0;
    return depth <= document.querySelectorAll('[aria-modal="true"]').length;
  });

// page.goto and page.reload after any dialog that may just have closed. Specs navigate with these.
export const open = async (page: Page, url: string) => {
  await settleOverlays(page);
  await page.goto(url);
};
export const reload = async (page: Page) => {
  await settleOverlays(page);
  await page.reload();
};

// Toasts are role="status", and so is the credit banner, so they are told apart by text.
export const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

// A dialog by its text. Every dialog is named by its title now (getByRole("dialog", { name })),
// so this is for matching on text further down in it.
export const dialogWith = (page: Page, text: string) => page.getByRole("dialog").filter({ hasText: text });

export const loginViaForm = async (page: Page, email: string, password: string) => {
  await submitLoginForm(page, email, password);
  await expect(page).toHaveURL(/\/dashboard$/);
};

// A restaurant's or store's My profile: opens a section of the accordion by its title.
export const openProfileSection = async (page: Page, title: string | RegExp) => {
  const header = page.locator("[data-testid^=profile-section-] h2").getByRole("button", { name: title }).first();
  await expect(header).toBeVisible();
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
};

// Saves a restaurant's or store's My profile with the button at the bottom (the round one at the
// top has the same name) and waits for the confirmation.
export const saveProfile = async (page: Page) => {
  await page.getByRole("button", { name: "Sačuvaj izmjene" }).last().click();
  await expect(toast(page, "Izmjene su sačuvane.")).toBeVisible();
};

// The forced change of an admin-set temporary password on the old My profile (a company
// headquarters or an admin).
export const changeTemporaryPassword = async (page: Page, temporaryPassword: string, newPassword: string) => {
  await open(page, "/my-profile");
  await page.getByLabel("Trenutna lozinka").fill(temporaryPassword);
  await page.getByLabel("Nova lozinka", { exact: true }).fill(newPassword);
  await page.getByLabel("Ponovite novu lozinku").fill(newPassword);
  await page.getByRole("button", { name: "Promijeni lozinku" }).click();
  await expect(toast(page, "Lozinka je promijenjena.")).toBeVisible();
};

// Searches the marketplace ("Pretraga", grouped by store) by (part of) a product name and returns
// the matching product cards. The search is debounced, so assert on the result (toHaveCount,
// toBeVisible), never read it right away.
export const searchMarketplace = async (page: Page, name: string) => {
  await open(page, "/search");
  await page.getByPlaceholder("Pretraga po nazivu proizvoda").fill(name);
  return page.getByTestId("store-product-card").filter({ hasText: name });
};

// The product is not offered. The page keeps the previous list until the filtered answer arrives,
// so waiting for the empty state (rather than toHaveCount(0)) proves the search really ran.
export const expectNotInMarketplace = async (page: Page, name: string) => {
  const cards = await searchMarketplace(page, name);
  await expect(page.getByTestId("search-empty")).toContainText("Nema ponuda za ove filtere");
  await expect(cards).toHaveCount(0);
};

// Submits the login form and stays wherever the app lands (a refused login stays on /login).
export const submitLoginForm = async (page: Page, email: string, password: string) => {
  await open(page, "/login");
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
  await open(page, "/credits");
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

// Puts a product into the cart from Search: + on its card adds 1; any other amount (also a
// decimal like "2,5") is then typed into its line on the cart page.
export const addToCart = async (page: Page, productName: string, quantity: string) => {
  const card = await searchMarketplace(page, productName);
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: `Dodaj u korpu: ${productName}` }).click();
  await expect(card.getByRole("group", { name: `Količina u korpi: ${productName}` })).toBeVisible();
  if (quantity === "1") return;
  await open(page, "/cart");
  const input = page.getByLabel(`Količina: ${productName}`);
  await input.fill(quantity);
  await input.press("Enter");
  await input.blur();
  await expect(page.getByTestId("cart-line").filter({ hasText: productName }).getByLabel(`Količina: ${productName}`)).toHaveValue(quantity);
};

// Opens the cart, picks the pickup (tomorrow at `time`) and sends the order. Returns the code
// from the confirmation (K7PM); the confirmation stays on screen for the caller to check.
export const checkout = async (page: Page, { time = "12:00", acceptPartial = true }: { time?: string; acceptPartial?: boolean } = {}) => {
  if (!page.url().endsWith("/cart")) await open(page, "/cart");
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

// The id of the order on the confirmation, from its "Pogledaj narudžbu" link.
export const sentOrderId = async (page: Page) => {
  await sentOrderCode(page);
  const href = await page.getByRole("link", { name: "Pogledaj narudžbu" }).getAttribute("href");
  return Number(/\/orders\/(\d+)$/.exec(href ?? "")![1]);
};

// A pickup card on Preuzimanja, found by a product in it.
export const pickupCard = (page: Page, productName: string) => page.getByTestId("pickup-card").filter({ hasText: productName });

// An order card on the restaurant's Moje narudžbe, found by a product in it.
export const myOrderCard = (page: Page, productName: string) => page.getByTestId("my-order-card").filter({ hasText: productName });

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
  await open(page, "/orders");
  await page.getByPlaceholder("Pretraga po proizvodu").fill(productName);
  const card = page.getByTestId("order-card").filter({ hasText: productName });
  await expect(card).toHaveCount(1);
  return card;
};
