import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { isoDate } from "../support/dates.js";
import { emptyCart, open } from "../support/ui.js";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

// No horizontal scroll: the page is never wider than the screen (mobile-layout.spec.ts checks 375 px).
const expectNoSideScroll = async (page: Page) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
};

test.use({ storageState: storageState("restaurant") });

// Specs run one at a time, so pausing the shared store is safe; this puts it back, also when a
// test fails.
test.afterEach(async () => {
  const api = await apiAs("store");
  await api.patch("/api/users/me/order-settings", { data: { orders_paused: false } });
  await api.dispose();
});

// Runs on desktop Chrome (the sidebar) and on the iPhone project (the bottom bar).
test("a restaurant filters Search by category and expiry, scrolls a store's slider, adds with + and goes to the cart", async ({ page }) => {
  const prefix = uniqueName("E2E Pretraga");
  // Five dairy products expiring tomorrow, one later, and a bakery product.
  const tomorrow = ["Jogurt", "Kefir", "Sir", "Pavlaka", "Mlijeko"].map((name) => `${prefix} ${name}`);
  const later = `${prefix} Kajmak`;
  const bread = `${prefix} Hljeb`;
  const storeApi = await apiAs("store");
  for (const name of tomorrow) await createProduct(storeApi, { name, category: "Dairy", unit: "kom", quantity: 3, expiry_date: isoDate(1) });
  await createProduct(storeApi, { name: later, category: "Dairy", unit: "kom", quantity: 3, expiry_date: isoDate(4) });
  await createProduct(storeApi, { name: bread, category: "Bakery", unit: "kom", quantity: 3, expiry_date: isoDate(4) });
  await storeApi.dispose();
  await emptyCart(page);

  const ours = page.getByTestId("search-store").filter({ has: page.getByRole("heading", { name: ACCOUNTS.store.businessName }) });
  const cards = ours.getByTestId("store-product-card");

  await test.step("Stari link vodi na Pretragu, a navigacija je preimenovana", async () => {
    await open(page, "/browse-products");
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("heading", { level: 1, name: "Pretraga" })).toBeVisible();
    const nav = isPhone(page) ? page.getByRole("navigation", { name: "Glavna navigacija" }) : page.locator("aside");
    await expect(nav.getByRole("link", { name: "Pretraga" })).toBeVisible();
    await expect(page.getByTestId("active-filter").filter({ hasText: "Do 10 km" })).toBeVisible();
  });

  await test.step("Svi proizvodi prodavnice, Sve (N) i oznaka prodavnice", async () => {
    await page.getByPlaceholder("Pretraga po nazivu proizvoda").fill(prefix);
    await expect(cards).toHaveCount(7);
    await expect(ours.getByTestId("store-kind")).toBeVisible();
    await expect(ours.getByRole("link", { name: /^Sve \(7\)/ })).toHaveAttribute("href", /\/stores\/\d+$/);
  });

  await test.step("Filteri: kategorija i rok trajanja, s čipovima", async () => {
    await page.getByRole("button", { name: /^Filteri/ }).click();
    const drawer = page.getByRole("dialog", { name: "Filteri" });
    await drawer.getByRole("button", { name: "Mliječni proizvodi" }).click();
    await expect(cards).toHaveCount(6);
    await drawer.getByRole("button", { name: "Do sutra" }).click();
    await expect(cards).toHaveCount(5);
    await drawer.getByRole("button", { name: "Zatvori", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId("active-filter")).toHaveText(["Mliječni proizvodi", "Ističe do sutra", "Do 10 km"]);
    await expectNoSideScroll(page);
  });

  await test.step("Više od četiri proizvoda: red je slajder", async () => {
    const slider = ours.getByTestId("product-slider");
    await expect(slider).toBeVisible();
    const last = cards.last();
    if (isPhone(page)) {
      await last.scrollIntoViewIfNeeded();
    } else {
      await expect(slider.getByRole("button", { name: "Prethodni proizvodi" })).toBeHidden();
      await slider.getByRole("button", { name: "Sljedeći proizvodi" }).click();
      await expect(slider.getByRole("button", { name: "Prethodni proizvodi" })).toBeVisible();
    }
    await expect(last).toBeInViewport();
  });

  await test.step("+ dodaje u korpu, stepper povećava količinu, traka vodi u korpu", async () => {
    const name = tomorrow[0]!;
    const card = cards.filter({ hasText: name });
    await card.getByRole("button", { name: `Dodaj u korpu: ${name}` }).click();
    const quantity = card.getByLabel(`Količina u korpi: ${name} (kom)`);
    await expect(quantity).toHaveValue("1");
    await card.getByRole("button", { name: `Povećaj količinu: ${name}` }).click();
    await expect(quantity).toHaveValue("2");
    const bar = page.getByTestId("store-cart-bar");
    await expect(bar).toContainText(`Korpa · ${ACCOUNTS.store.businessName}`);
    await bar.getByRole("link", { name: "Idi na korpu" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("cart-line").filter({ hasText: name })).toBeVisible();
  });

  await test.step("Bez rezultata: Očisti filtere", async () => {
    await open(page, "/search");
    await page.getByPlaceholder("Pretraga po nazivu proizvoda").fill(`${prefix} nepostojeći`);
    await page.getByRole("button", { name: "Ukloni filter: Udaljenost" }).click();
    const empty = page.getByTestId("search-empty");
    await expect(empty).toContainText("Nema ponuda za ove filtere");
    await empty.getByRole("button", { name: "Očisti filtere" }).click();
    await expect(page.getByPlaceholder("Pretraga po nazivu proizvoda")).toHaveValue("");
  });
  await emptyCart(page);
});

test("a paused store's products cannot be added from Search", async ({ page }) => {
  const name = uniqueName("E2E Pretraga Pauza");
  const storeApi = await apiAs("store");
  await createProduct(storeApi, { name, unit: "kom", quantity: 3 });
  await storeApi.patch("/api/users/me/order-settings", { data: { orders_paused: true, orders_paused_until: null } });
  await storeApi.dispose();

  await open(page, "/search");
  await page.getByPlaceholder("Pretraga po nazivu proizvoda").fill(name);
  const store = page.getByTestId("search-store").filter({ hasText: name });
  await expect(store.getByTestId("search-store-paused")).toContainText("Narudžbe pauzirane");
  const add = store.getByRole("button", { name: `${name}: prodavnica trenutno ne prima narudžbe` });
  await expect(add).toBeDisabled();
  await expect(store.getByRole("link", { name })).toHaveAttribute("href", /\/products\/\d+$/);
});
