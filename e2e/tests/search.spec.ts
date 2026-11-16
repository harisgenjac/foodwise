import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { emptyCart, open } from "../support/ui.js";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

test.use({ storageState: storageState("restaurant") });

// Runs on desktop Chrome (the sidebar) and on the iPhone project (the bottom bar).
test("Search groups offers by store, links each store and adds with +", async ({ page }) => {
  const prefix = uniqueName("E2E Pretraga");
  const names = ["Jogurt", "Kefir", "Sir", "Pavlaka", "Mlijeko"].map((name) => `${prefix} ${name}`);
  const storeApi = await apiAs("store");
  for (const name of names) await createProduct(storeApi, { name, unit: "kom", quantity: 3 });
  await storeApi.dispose();
  const brezaApi = await apiAs("brezaStore");
  await createProduct(brezaApi, { name: `${prefix} Breza` });
  await brezaApi.dispose();
  await emptyCart(page);

  await test.step("Stari link vodi na Pretragu, a navigacija je preimenovana", async () => {
    await open(page, "/browse-products");
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("heading", { level: 1, name: "Pretraga" })).toBeVisible();
    const nav = isPhone(page) ? page.getByRole("navigation", { name: "Glavna navigacija" }) : page.locator("aside");
    await expect(nav.getByRole("link", { name: "Pretraga" })).toBeVisible();
  });

  await test.step("Rezultati po prodavnici, sa vezom na stranicu prodavnice", async () => {
    await page.getByPlaceholder("Pretraga po imenu").fill(prefix);
    const groups = page.getByTestId("search-store");
    await expect(groups).toHaveCount(2);
    const ours = groups.filter({ has: page.getByRole("heading", { name: ACCOUNTS.store.businessName }) });
    // Four products per store; the rest is on the store page.
    await expect(ours.getByTestId("store-product-card")).toHaveCount(4);
    await ours.getByRole("link", { name: "Sve (5)" }).click();
    await expect(page).toHaveURL(/\/stores\/\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: ACCOUNTS.store.businessName })).toBeVisible();
  });

  await test.step("+ dodaje u korpu iz rezultata", async () => {
    await open(page, "/search");
    await page.getByPlaceholder("Pretraga po imenu").fill(`${prefix} Breza`);
    const card = page.getByTestId("store-product-card").filter({ hasText: `${prefix} Breza` });
    await card.getByRole("button", { name: `Dodaj u korpu: ${prefix} Breza` }).click();
    await expect(card.getByRole("group", { name: `Količina u korpi: ${prefix} Breza` })).toBeVisible();
  });

  await test.step("Bez rezultata", async () => {
    await page.getByPlaceholder("Pretraga po imenu").fill(`${prefix} nepostojeći`);
    await expect(page.getByText("Nema rezultata", { exact: true })).toBeVisible();
  });
  await emptyCart(page);
});
