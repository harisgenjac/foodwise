import { expect, test } from "@playwright/test";
import { runId, storageState } from "../support/accounts.js";
import { apiAs, createProduct, sendOrderOf } from "../support/api.js";
import { open, searchMarketplace, toast } from "../support/ui.js";

// A restaurant orders two products with partial fulfilment accepted; the store accepts less of one
// (not enough in stock, the difference sold in its shop) and rejects the other (quality).
test("the store accepts part of an order with reasons, and the restaurant sees the changes", async ({ browser }) => {
  const id = runId();
  const chicken = `E2E Piletina ${id}`;
  const milk = `E2E Mlijeko ${id}`;

  // Arrange through the API: two products (2 KM a kg) and one order of 6 kg and 4 kg (20 KM).
  const storeApi = await apiAs("store");
  const chickenProduct = await createProduct(storeApi, { name: chicken, quantity: 10 });
  const milkProduct = await createProduct(storeApi, { name: milk, quantity: 10 });
  await storeApi.dispose();
  const restaurantApi = await apiAs("restaurant");
  const order = await sendOrderOf(restaurantApi, [
    { productId: chickenProduct.id, quantity: 6, unitPrice: 2 },
    { productId: milkProduct.id, quantity: 4, unitPrice: 2 },
  ]);
  await restaurantApi.dispose();
  const code = `#${order.code}`;

  const storeContext = await browser.newContext({ storageState: storageState("store") });
  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const store = await storeContext.newPage();
  const restaurant = await restaurantContext.newPage();

  await test.step("Prodavnica prihvata 4 kg piletine i odbija mlijeko", async () => {
    await open(store, `/orders/${order.id}`);
    await store.getByRole("button", { name: "Odluči" }).click();
    const dialog = store.getByRole("dialog", { name: `Odluka o narudžbi ${code}` });
    const chickenLine = dialog.getByTestId("decision-line").filter({ hasText: chicken });
    const milkLine = dialog.getByTestId("decision-line").filter({ hasText: milk });

    await chickenLine.getByRole("radio", { name: "Prihvati manje" }).click();
    await chickenLine.getByLabel(`Prihvaćena količina: ${chicken}`).fill("4");
    await chickenLine.getByLabel("Razlog").selectOption({ label: "Nema dovoljno na stanju" });
    await chickenLine.getByRole("checkbox", { name: "Upiši razliku kao prodano u radnji" }).check();
    await expect(chickenLine.getByRole("spinbutton", { name: "Prodano u radnji" })).toHaveValue("2");

    await milkLine.getByRole("radio", { name: "Odbij" }).click();
    await milkLine.getByLabel("Razlog").selectOption({ label: "Kvalitet" });

    await expect(dialog.getByText("Novi iznos: 8.00 KM umjesto 20.00 KM")).toBeVisible();
    await dialog.getByRole("button", { name: "Potvrdi odluku" }).click();
    await expect(dialog.getByText("Prihvatate 0, manje količine 1, odbijate 1 · 8.00 KM")).toBeVisible();
    await dialog.getByRole("button", { name: "Sačuvaj odluku" }).click();
    await expect(toast(store, "Odluka o narudžbi je sačuvana.")).toBeVisible();
  });

  await test.step("Restoran vidi djelimično prihvaćenu narudžbu s razlozima i novim iznosom", async () => {
    await open(restaurant, "/my-orders");
    const card = restaurant.getByTestId("my-order-card").filter({ hasText: `Narudžba ${code}` });
    await expect(card.getByTestId("order-status")).toHaveText("Djelimično prihvaćena");
    await expect(card.getByTestId("old-total")).toHaveClass(/line-through/);
    await card.getByRole("link", { name: `Detalji narudžbe ${code}` }).click();

    await expect(restaurant.getByTestId("order-hero")).toContainText(`Narudžba ${code}`);
    await expect(restaurant.getByRole("heading", { level: 1, name: "Prihvaćeno djelimično" })).toBeVisible();
    await expect(restaurant.getByTestId("order-status")).toHaveText("Djelimično prihvaćena");
    const chickenRow = restaurant.getByTestId("order-item").filter({ hasText: chicken });
    await expect(chickenRow).toContainText("6 kg → 4 kg");
    await expect(chickenRow.getByTestId("item-note")).toContainText("Nema dovoljno na stanju");
    const milkRow = restaurant.getByTestId("order-item").filter({ hasText: milk });
    await expect(milkRow.getByRole("link", { name: milk })).toHaveClass(/line-through/);
    await expect(milkRow.getByText("Kvalitet")).toBeVisible();
    await expect(restaurant.getByTestId("old-total")).toHaveClass(/line-through/);
    await expect(restaurant.getByTestId("old-total")).toContainText("20,00 KM");

    await open(restaurant, "/notifications");
    await expect(restaurant.getByText(`Vaša narudžba ${code} je djelimično prihvaćena.`)).toBeVisible();
  });

  await test.step("Ponuda: piletine 4 kg (2 kg prodano u radnji), mlijeko opet cijelo", async () => {
    await expect((await searchMarketplace(restaurant, chicken)).getByText("Dostupno: 4 kg")).toBeVisible();
    await expect((await searchMarketplace(restaurant, milk)).getByText("Dostupno: 10 kg")).toBeVisible();
  });

  await storeContext.close();
  await restaurantContext.close();
});
