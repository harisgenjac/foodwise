import { expect, test } from "@playwright/test";
import { ACCOUNTS, storageState, uniqueName } from "../support/accounts.js";
import { acceptOrder, apiAs, createProduct, sendOrder } from "../support/api.js";
import { makePickupOverdue } from "../support/db.js";
import { pickupCard, searchMarketplace, toast } from "../support/ui.js";

test("a store cancels a pickup the restaurant missed and the food is offered again", async ({ browser }) => {
  const productName = uniqueName("E2E Burek");
  const code = await test.step("Narudžba svih 10 kg je prihvaćena, a dan preuzimanja je prošao", async () => {
    const storeApi = await apiAs("store");
    const restaurantApi = await apiAs("restaurant");
    const product = await createProduct(storeApi, { name: productName, quantity: 10, unit: "kg" });
    const order = await sendOrder(restaurantApi, product.id, 10);
    // The whole quantity is promised, so the product is sold out until the cancel.
    await acceptOrder(storeApi, order.id);
    await makePickupOverdue(order.id);
    await storeApi.dispose();
    await restaurantApi.dispose();
    return order.code;
  });

  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  await test.step("Prodavnica vidi zakašnjelo preuzimanje i otkazuje ga", async () => {
    await store.goto("/pickups");
    await expect(store.getByRole("heading", { name: /^Zakašnjelo/ })).toBeVisible();
    const card = pickupCard(store, productName);
    await expect(card.getByText("Kasni 2 dana")).toBeVisible();
    await expect(card.getByText(ACCOUNTS.restaurant.businessName)).toBeVisible();
    await card.getByRole("button", { name: "Otkaži" }).click();
    const dialog = store.getByRole("dialog", { name: "Otkazati zakašnjelo preuzimanje?" });
    await expect(dialog.getByText(`${ACCOUNTS.restaurant.businessName} nije preuzeo narudžbu #${code} na vrijeme.`, { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Otkaži narudžbu" }).click();
    await expect(toast(store, "Propuštena narudžba je otkazana.")).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  await test.step("Restoran dobija obavijest, a narudžba je otkazana", async () => {
    await restaurant.goto("/notifications");
    await restaurant.getByText(`Narudžba #${code} je otkazana jer nije preuzeta na vrijeme.`).click();
    await expect(restaurant.getByRole("heading", { level: 1, name: `Narudžba #${code}` })).toBeVisible();
    await expect(restaurant.getByText("Otkazano", { exact: true }).first()).toBeVisible();
  });

  await test.step("Proizvod je opet ponuđen u cijeloj količini", async () => {
    const card = await searchMarketplace(restaurant, productName);
    await expect(card.getByText("10 kilogram (kg)")).toBeVisible();
  });

  await storeContext.close();
  await restaurantContext.close();
});
