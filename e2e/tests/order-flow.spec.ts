import { expect, test } from "@playwright/test";
import { ACCOUNTS, runId, storageState } from "../support/accounts.js";
import { myOrderCard, open, orderFromMarketplace, pickupCard, reload, storeOrderCard, toast } from "../support/ui.js";

test("a store publishes a product, a restaurant orders it and the store hands it over", async ({ browser }) => {
  const productName = `E2E Mlijeko ${runId()}`;
  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  // The store publishes a product.
  await open(store, "/add-product");
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

  // The store sees it under Pickups, tomorrow.
  await open(store, "/pickups");
  await store.getByRole("tab", { name: /Nadolazeće/ }).click();
  await expect(store.getByRole("heading", { level: 2, name: "Sutra" })).toBeVisible();
  await expect(pickupCard(store, productName).getByText(ACCOUNTS.restaurant.businessName)).toBeVisible();

  // The restaurant follows it on My orders: accepted, picked up tomorrow at 14:30.
  await open(restaurant, "/my-orders");
  const myOrder = myOrderCard(restaurant, productName);
  await expect(myOrder.getByText(ACCOUNTS.store.businessName)).toBeVisible();
  await expect(myOrder.getByTestId("order-status")).toHaveText("Potvrđeno");
  await expect(myOrder.getByTestId("order-when")).toHaveText("Sutra · 14:30");

  // The store marks the whole order picked up.
  await pickupCard(store, productName).getByRole("button", { name: "Označi kao preuzeto" }).click();
  await store
    .getByRole("dialog", { name: "Potvrditi preuzimanje?" })
    .getByRole("button", { name: "Potvrdi preuzimanje" })
    .click();
  await expect(toast(store, "Narudžba je označena kao preuzeta.")).toBeVisible();

  // The restaurant finds it picked up in its history and gets the notification, which opens the order.
  await reload(restaurant);
  await restaurant.getByRole("tab", { name: /Historija/ }).click();
  const historyRow = restaurant.getByRole("table", { name: "Historija narudžbi" }).getByRole("row").filter({ hasText: productName });
  await expect(historyRow.getByRole("cell", { name: "Preuzeto", exact: true })).toBeVisible();
  await open(restaurant, "/notifications");
  await restaurant.getByText(`Preuzimanje narudžbe #${code} je potvrđeno.`).click();
  await expect(restaurant.getByTestId("order-hero").getByText(`Narudžba #${code}`, { exact: true })).toBeVisible();
  await expect(restaurant.getByText("Preuzeto", { exact: true }).first()).toBeVisible();

  await storeContext.close();
  await restaurantContext.close();
});
