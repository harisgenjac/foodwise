import { expect, test } from "@playwright/test";
import { storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { sarajevoDate, isoDate } from "../support/dates.js";
import { dialogWith, expectNotInMarketplace, searchMarketplace, toast } from "../support/ui.js";

test("a store donates a product's free quantity and returns it to the offer", async ({ browser }) => {
  const productName = uniqueName("E2E Donacija");
  const storeApi = await apiAs("store");
  await createProduct(storeApi, { name: productName, quantity: 5, unit: "kg", category: "Vegetables", expiry_date: isoDate(4) });
  await storeApi.dispose();

  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();
  const donationCard = store
    .getByTestId("donation-card")
    .filter({ has: store.getByRole("heading", { name: productName }) });

  await test.step("Restoran vidi ponudu", async () => {
    await expect(await searchMarketplace(restaurant, productName)).toHaveCount(1);
  });

  await test.step("Prodavnica prebacuje cijelu slobodnu količinu u donacije", async () => {
    await store.goto("/my-products");
    await store.getByPlaceholder("Pretraga po imenu").fill(productName);
    const card = store.getByTestId("product-card").filter({ has: store.getByRole("heading", { name: productName }) });
    await card.getByRole("button", { name: "Prebaci u donaciju" }).click();
    const dialog = dialogWith(store, "Slobodna količina ide u donacije");
    await expect(dialog.getByText("Dostupno: 5 kilogram (kg)")).toBeVisible();
    await expect(dialog.getByLabel("Količina za donaciju")).toHaveValue("5");
    await dialog.getByRole("button", { name: "Prebaci", exact: true }).click();
    await expect(toast(store, "Proizvod je prebačen u donacije.")).toBeVisible();
  });

  await test.step("Donacija je na stranici Doniraj hranu, ponuda nestaje", async () => {
    await store.goto("/donate-food");
    await expect(store.getByRole("heading", { level: 1, name: "Doniraj hranu" })).toBeVisible();
    await expect(donationCard).toHaveCount(1);
    for (const text of ["Iz ponude", "Besplatno", "Povrće", "5 kilogram (kg)", sarajevoDate(4)]) {
      await expect(donationCard.getByText(text, { exact: true }).first()).toBeVisible();
    }
    await expectNotInMarketplace(restaurant, productName);
  });

  await test.step("Prodavnica uklanja donaciju i vraća proizvod u ponudu", async () => {
    await donationCard.getByRole("button", { name: "Obriši" }).click();
    await dialogWith(store, "Ukloniti donaciju?").getByRole("button", { name: "Vrati u ponudu" }).click();
    await expect(toast(store, "Proizvod je vraćen u ponudu.")).toBeVisible();
    await expect(donationCard).toHaveCount(0);
    const offer = await searchMarketplace(restaurant, productName);
    await expect(offer).toHaveCount(1);
    await expect(offer.getByText("5 kilogram (kg)")).toBeVisible();
  });

  await storeContext.close();
  await restaurantContext.close();
});
