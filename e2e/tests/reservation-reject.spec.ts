import { expect, test, type Page } from "@playwright/test";
import { storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { sarajevoDate } from "../support/dates.js";
import { availableCredits, expectAvailableCredits, toast } from "../support/ui.js";

const marketplaceCard = async (page: Page, productName: string) => {
  await page.goto("/browse-products");
  await page.getByPlaceholder("Pretraga po imenu").fill(productName);
  const card = page.getByTestId("product-card").filter({ has: page.getByRole("heading", { name: productName }) });
  await expect(card).toHaveCount(1);
  return card;
};

test("a rejected reservation gives the restaurant its credit back", async ({ browser }) => {
  const productName = uniqueName("E2E Jogurt");
  const storeApi = await apiAs("store");
  await createProduct(storeApi, { name: productName, quantity: 10, unit: "kg" });
  await storeApi.dispose();

  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  const before = await test.step("Restoran: krediti prije rezervacije", () => availableCredits(restaurant));

  await test.step("Restoran rezerviše 4 od 10 kg", async () => {
    const card = await marketplaceCard(restaurant, productName);
    await expect(card.getByText("10 kilogram (kg)")).toBeVisible();
    await card.getByRole("button", { name: "Rezerviši" }).click();
    const dialog = restaurant.getByRole("dialog");
    await expect(dialog.getByText(`Ovo troši 1 kredit (preostalo: ${before})`)).toBeVisible();
    await dialog.getByLabel("Datum preuzimanja").fill(sarajevoDate(1));
    await dialog.getByLabel("Datum preuzimanja").press("Enter");
    await dialog.getByLabel("Vrijeme preuzimanja").fill("12:00");
    await dialog.getByLabel("Količina").fill("4");
    await dialog.getByRole("button", { name: "Potvrdi" }).click();
    await expect(toast(restaurant, "Rezervacija uspješno kreirana.")).toBeVisible();
    await expectAvailableCredits(restaurant, before - 1);
  });

  await test.step("Prodavnica odbija zahtjev", async () => {
    await store.goto("/reservations");
    await store.getByPlaceholder("Pretraga po imenu").fill(productName);
    const card = store.getByTestId("reservation-card").filter({ has: store.getByRole("heading", { name: productName }) });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "Odbij" }).click();
    await store.getByRole("dialog", { name: "Odbiti ovu rezervaciju?" }).getByRole("button", { name: "Odbij" }).click();
    await expect(toast(store, "Rezervacija je uspješno odbijena.")).toBeVisible();
  });

  await test.step("Restoran vidi odbijenu rezervaciju i obavijest", async () => {
    await restaurant.goto("/my-reservations");
    await restaurant.getByRole("tab", { name: /Historija/ }).click();
    const row = restaurant.getByRole("link").filter({ hasText: productName });
    await expect(row.getByText("Odbijeno", { exact: true })).toBeVisible();
    await restaurant.goto("/notifications");
    await expect(restaurant.getByText(`Vaša rezervacija za ${productName} je odbijena.`)).toBeVisible();
  });

  await test.step("Kredit je vraćen, proizvod je opet ponuđen u cijeloj količini", async () => {
    await expectAvailableCredits(restaurant, before);
    const card = await marketplaceCard(restaurant, productName);
    await expect(card.getByText("10 kilogram (kg)")).toBeVisible();
  });

  await storeContext.close();
  await restaurantContext.close();
});
