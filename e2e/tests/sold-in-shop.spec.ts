import { expect, test } from "@playwright/test";
import { storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { toast } from "../support/ui.js";

// "Prodano u radnji": the store records what it sold at its own till; after a confirmation that
// shows the amount and the free quantity before and after, restaurants see only what is left.
test("a store records a sale in its shop and restaurants see less available", async ({ browser }) => {
  const productName = uniqueName("E2E Sir");
  const storeApi = await apiAs("store");
  const product = await createProduct(storeApi, { name: productName, quantity: 10, unit: "kg" });
  await storeApi.dispose();

  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  await test.step("Prodavnica upisuje 4 kg prodana u radnji i potvrđuje", async () => {
    await store.goto(`/products/${product.id}`);
    await store.getByRole("button", { name: "Prodano u radnji" }).click();
    const dialog = store.getByRole("dialog");
    await dialog.getByLabel("Količina prodana u radnji").fill("4");
    await dialog.getByRole("button", { name: "Nastavi" }).click();
    await expect(dialog.getByText("Prodano u radnji: 4 kilogram (kg).")).toBeVisible();
    await expect(dialog.getByText("Dostupno nakon ovoga: 6 kilogram (kg) (sada 10 kilogram (kg)).")).toBeVisible();
    await expect(dialog.getByText(/Ovo se ne može poništiti/)).toBeVisible();
    await dialog.getByRole("button", { name: "Upiši prodaju" }).click();
    await expect(toast(store, "Prodaja u radnji je upisana.")).toBeVisible();
    await expect(store.getByRole("heading", { name: "Prodano u vašoj radnji" })).toBeVisible();
  });

  await test.step("Restoran vidi samo 6 kg dostupno", async () => {
    await restaurant.goto(`/products/${product.id}`);
    await expect(restaurant.getByText("6 kilogram (kg)").first()).toBeVisible();
    await expect(restaurant.getByText("Prodano u vašoj radnji")).toHaveCount(0);
  });

  await storeContext.close();
  await restaurantContext.close();
});
