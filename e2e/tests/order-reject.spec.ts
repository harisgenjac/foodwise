import { expect, test } from "@playwright/test";
import { storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { open, orderFromMarketplace, searchMarketplace, storeOrderCard, toast } from "../support/ui.js";

test("a rejected order puts the quantity back on offer, with no credits for the restaurant", async ({ browser }) => {
  const productName = uniqueName("E2E Jogurt");
  const storeApi = await apiAs("store");
  await createProduct(storeApi, { name: productName, quantity: 10, unit: "kg" });
  await storeApi.dispose();

  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  const code = await test.step("Restoran naručuje 4 od 10 kg", async () => {
    const card = await searchMarketplace(restaurant, productName);
    await expect(card.getByText("Dostupno: 10 kg")).toBeVisible();
    // Restaurants pay no credits: Search says nothing about them.
    await expect(restaurant.getByRole("main").getByText(/kredit/i)).toHaveCount(0);
    return orderFromMarketplace(restaurant, productName, { quantity: "4" });
  });

  await test.step("Prodavnica odbija narudžbu s razlogom", async () => {
    const card = await storeOrderCard(store, productName);
    await card.getByRole("button", { name: "Odluči" }).click();
    await store.getByRole("dialog").getByRole("button", { name: "Odbij narudžbu" }).click();
    const dialog = store.getByRole("dialog", { name: `Odbij narudžbu #${code}` });
    await dialog.getByLabel("Razlog").selectOption({ label: "Kvalitet" });
    await dialog.getByRole("button", { name: "Odbij narudžbu" }).click();
    await expect(store.getByRole("dialog").getByText(`Odbijate cijelu narudžbu #${code}.`)).toBeVisible();
    await store.getByRole("dialog").getByRole("button", { name: "Odbij narudžbu" }).click();
    await expect(toast(store, "Odluka o narudžbi je sačuvana.")).toBeVisible();
  });

  await test.step("Restoran vidi odbijenu narudžbu, razlog i obavijest", async () => {
    await open(restaurant, "/my-orders");
    await restaurant.getByRole("tab", { name: /Historija/ }).click();
    const row = restaurant.getByRole("link").filter({ hasText: productName });
    await expect(row.getByText("Odbijeno", { exact: true })).toBeVisible();
    await row.click();
    await expect(restaurant.getByRole("heading", { level: 1, name: `Narudžba #${code}` })).toBeVisible();
    await expect(restaurant.getByTestId("order-item").getByText("Kvalitet")).toBeVisible();
    await open(restaurant, "/notifications");
    await expect(restaurant.getByText(`Vaša narudžba #${code} je odbijena.`)).toBeVisible();
  });

  await test.step("Proizvod je opet ponuđen u cijeloj količini, a restoran nema stranicu kredita", async () => {
    await open(restaurant, "/credits");
    await expect(restaurant).toHaveURL(/\/dashboard$/);
    const card = await searchMarketplace(restaurant, productName);
    await expect(card.getByText("Dostupno: 10 kg")).toBeVisible();
  });

  await storeContext.close();
  await restaurantContext.close();
});
