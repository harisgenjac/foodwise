import { expect, test } from "@playwright/test";
import { ACCOUNTS, storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { open, orderFromMarketplace, searchMarketplace, toast } from "../support/ui.js";

test("a restaurant withdraws a pending order and the store finds it by its code", async ({ browser }) => {
  const productName = uniqueName("E2E Pavlaka");
  const storeApi = await apiAs("store");
  await createProduct(storeApi, { name: productName, quantity: 10, unit: "kg" });
  await storeApi.dispose();

  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  const code = await test.step("Restoran naručuje 3 od 10 kg", () =>
    orderFromMarketplace(restaurant, productName, { quantity: "3" }),
  );

  await test.step("Restoran otkazuje narudžbu na čekanju", async () => {
    await open(restaurant, "/my-orders");
    await restaurant.getByPlaceholder("Proizvod, prodavnica ili kod (#K7PM)").fill(productName);
    const card = restaurant.getByTestId("my-order-card").filter({ hasText: productName });
    await expect(card.getByTestId("order-status")).toHaveText("Na čekanju");
    await card.getByRole("button", { name: `Otkaži narudžbu #${code}` }).click();
    const dialog = restaurant.getByRole("dialog", { name: "Otkazati ovu narudžbu?" });
    await expect(dialog.getByText(`Narudžba #${code} kod ${ACCOUNTS.store.businessName} će biti otkazana.`)).toBeVisible();
    await dialog.getByRole("button", { name: "Otkaži narudžbu" }).click();
    await expect(toast(restaurant, "Narudžba je otkazana.")).toBeVisible();
    await expect(card).toHaveCount(0);

    await restaurant.getByRole("tab", { name: /Historija/ }).click();
    const row = restaurant.getByRole("table", { name: "Historija narudžbi" }).getByRole("row").filter({ hasText: productName });
    await expect(row.getByTestId("order-status")).toHaveText("Otkazano");
  });

  await test.step("Prodavnica dobija obavijest i nalazi narudžbu po kodu", async () => {
    await open(store, "/notifications");
    await store.getByText(`${ACCOUNTS.restaurant.businessName} je otkazao narudžbu #${code}.`).click();
    await expect(store.getByRole("heading", { level: 1, name: `Narudžba #${code}` })).toBeVisible();
    await expect(store.getByRole("button", { name: "Odluči" })).toHaveCount(0);

    // The code search takes it with or without "#", in any case.
    for (const typed of [`#${code}`, code.toLowerCase()]) {
      await open(store, "/orders");
      await store.getByLabel("Kod narudžbe").fill(typed);
      const card = store.getByTestId("order-card");
      await expect(card).toHaveCount(1);
      await expect(card.getByText(`Narudžba #${code}`)).toBeVisible();
      await expect(card.getByText("Otkazano")).toBeVisible();
    }
  });

  await test.step("Količina je opet ponuđena", async () => {
    const card = await searchMarketplace(restaurant, productName);
    await expect(card.getByText("Dostupno: 10 kg")).toBeVisible();
  });

  await storeContext.close();
  await restaurantContext.close();
});
