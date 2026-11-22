import { expect, test } from "@playwright/test";
import { API_URL, storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct, myId } from "../support/api.js";
import { emptyCart, open, openProfileSection, reload, saveProfile, toast } from "../support/ui.js";

// A store's order settings: it pauses new orders on My profile, a restaurant sees the pause on
// the store page and cannot send its cart, and the store resumes there; the
// preparation time saves at once. Specs run one at a time, so pausing the shared store is safe;
// afterEach puts every setting back, also when the test fails. Runs on desktop Chrome and on the
// iPhone project (the pause is an urgent action, often taken on a phone).
test.use({ storageState: storageState("store") });

test.afterEach(async () => {
  const api = await apiAs("store");
  await api.patch("/api/users/me/order-settings", {
    data: { orders_paused: false, delivery_enabled: true, preparation_minutes: 30 },
  });
  await api.dispose();
});

test("a store pauses orders and a restaurant cannot send them meanwhile", async ({ page, browser }) => {
  const productName = uniqueName("E2E Pauza Sir");
  const storeApi = await apiAs("store");
  const storeId = await myId(storeApi);
  const product = await createProduct(storeApi, { name: productName, category: "Dairy", unit: "kom", quantity: 5 });
  await storeApi.dispose();

  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const restaurant = await restaurantContext.newPage();
  await emptyCart(restaurant);
  const added = await restaurant.request.put(`${API_URL}/api/cart/items/${product.id}`, { data: { quantity: 1 } });
  expect(added.ok()).toBe(true);

  await test.step("Prodavnica pauzira narudžbe na Mom profilu", async () => {
    await open(page, "/my-profile");
    await openProfileSection(page, /Narudžbe i dostava/);
    const pause = page.getByTestId("order-pause");
    await expect(pause.getByText("Aktivno")).toBeVisible();
    await pause.getByRole("button", { name: "Pauziraj narudžbe" }).click();
    const dialog = page.getByRole("dialog", { name: "Pauzirati narudžbe?" });
    await dialog.getByText("Dok je ne isključim").click();
    await dialog.getByRole("button", { name: "Pauziraj", exact: true }).click();
    // Only chosen so far: the page shows it, the save applies it.
    await expect(pause.getByText(/^Pauzirano/)).toBeVisible();
    await expect(pause.getByRole("button", { name: "Nastavi primanje" })).toBeVisible();
    await saveProfile(page);
    await reload(page);
    await openProfileSection(page, /Narudžbe i dostava/);
    await expect(page.getByTestId("order-pause").getByText(/^Pauzirano/)).toBeVisible();
  });

  await test.step("Restoran vidi pauzu i ne može poslati korpu", async () => {
    await open(restaurant, `/stores/${storeId}`);
    await expect(restaurant.getByText(/Ova prodavnica trenutno ne prima narudžbe/).first()).toBeVisible();
    await open(restaurant, "/cart");
    await expect(restaurant.getByText(productName)).toBeVisible();
    await expect(restaurant.getByRole("button", { name: "Pošalji narudžbu" })).toBeDisabled();
  });

  await test.step("Prodavnica nastavlja i mijenja vrijeme pripreme", async () => {
    await open(page, "/my-profile");
    await openProfileSection(page, /Narudžbe i dostava/);
    const pause = page.getByTestId("order-pause");
    await pause.getByRole("button", { name: "Nastavi primanje" }).click();
    await expect(pause.getByText("Aktivno")).toBeVisible();
    await page.getByLabel("Vrijeme pripreme").selectOption("45");
    await saveProfile(page);
    await reload(page);
    await openProfileSection(page, /Narudžbe i dostava/);
    await expect(page.getByLabel("Vrijeme pripreme")).toHaveValue("45");
  });

  await test.step("Restoran opet može poslati narudžbu", async () => {
    await reload(restaurant);
    await expect(restaurant.getByText(/Ova prodavnica trenutno ne prima narudžbe/)).toHaveCount(0);
    await expect(restaurant.getByRole("button", { name: "Pošalji narudžbu" })).toBeEnabled();
  });

  await emptyCart(restaurant);
  await restaurantContext.close();
});
