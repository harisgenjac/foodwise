import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, runId, storageState } from "../support/accounts.js";
import { orderFromMarketplace, storeOrderCard, toast } from "../support/ui.js";

// A pickup of the order, found by its product.
const pickupCard = (page: Page, productName: string) => page.getByTestId("pickup-card").filter({ hasText: productName });

test("a store publishes a product, a restaurant orders it and the store hands it over", async ({ browser }) => {
  const productName = `E2E Mlijeko ${runId()}`;
  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  // The store publishes a product.
  await store.goto("/add-product");
  await store.getByLabel("Naziv proizvoda").fill(productName);
  await store.getByRole("button", { name: "Mliječni proizvodi" }).click();
  await store.getByLabel("Originalna cijena").fill("4");
  await store.getByLabel("Snižena cijena").fill("2");
  await store.getByLabel("Količina").fill("10");
  await store.getByLabel("Jedinica mjere").selectOption({ label: "kilogram (kg)" });
  await store.getByRole("button", { name: "Za 3 dana" }).click();
  await store.getByRole("button", { name: "Dodaj proizvod" }).click();
  await expect(toast(store, "Proizvod uspješno kreiran.")).toBeVisible();

  // The restaurant orders part of it for tomorrow and gets the order's code.
  const code = await orderFromMarketplace(restaurant, productName, { quantity: "4", time: "14:30" });

  // The store sees the order and accepts everything.
  const card = await storeOrderCard(store, productName);
  await expect(card.getByText(`Narudžba #${code}`)).toBeVisible();
  await expect(card.getByText("Na čekanju")).toBeVisible();
  await expect(card.getByText(ACCOUNTS.restaurant.businessName)).toBeVisible();
  await card.getByRole("button", { name: "Odluči" }).click();
  const decision = store.getByRole("dialog", { name: `Odluka o narudžbi #${code}` });
  await decision.getByRole("button", { name: "Potvrdi odluku" }).click();
  await expect(decision.getByText("Prihvatate cijelu narudžbu (1 stavka) · 8.00 KM")).toBeVisible();
  await decision.getByRole("button", { name: "Sačuvaj odluku" }).click();
  await expect(toast(store, "Odluka o narudžbi je sačuvana.")).toBeVisible();

  // Both see it under Pickups, tomorrow.
  for (const [page, otherParty] of [
    [store, ACCOUNTS.restaurant.businessName],
    [restaurant, ACCOUNTS.store.businessName],
  ] as const) {
    await page.goto("/pickups");
    await page.getByRole("tab", { name: /Nadolazeće/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Sutra" })).toBeVisible();
    await expect(pickupCard(page, productName).getByText(otherParty)).toBeVisible();
  }
  await expect(pickupCard(restaurant, productName).getByText("Spremno za preuzimanje")).toBeVisible();

  // The store marks the whole order picked up.
  await pickupCard(store, productName).getByRole("button", { name: "Označi kao preuzeto" }).click();
  await store
    .getByRole("dialog", { name: "Potvrditi preuzimanje?" })
    .getByRole("button", { name: "Potvrdi preuzimanje" })
    .click();
  await expect(toast(store, "Narudžba je označena kao preuzeta.")).toBeVisible();

  // The restaurant sees it as picked up and gets the notification, which opens the order.
  await restaurant.reload();
  await restaurant.getByRole("tab", { name: /Preuzeto/ }).click();
  await expect(pickupCard(restaurant, productName).getByText(/^Preuzeto /)).toBeVisible();
  await restaurant.goto("/notifications");
  await restaurant.getByText(`Preuzimanje narudžbe #${code} je potvrđeno.`).click();
  await expect(restaurant.getByRole("heading", { level: 1, name: `Narudžba #${code}` })).toBeVisible();
  await expect(restaurant.getByText("Preuzeto", { exact: true }).first()).toBeVisible();

  await storeContext.close();
  await restaurantContext.close();
});
