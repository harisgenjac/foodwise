import { expect, test } from "@playwright/test";
import { API_URL, storageState, uniqueName } from "../support/accounts.js";
import { apiAs, cancelOrder, createProduct, setPinAs, simulateCourier } from "../support/api.js";
import { sarajevoMinutesNow } from "../support/dates.js";
import { emptyCart, open, reload, toast } from "../support/ui.js";

// A restaurant chooses delivery in the cart (delivery phase 2, the mock provider): the estimate
// with the price and the arrival, sending without a pickup time, and the delivery on the order
// page; the store accepts it with a ready time, which books the delivery with its final price. Both seeded businesses are in Visoko and get a pin there for the test (removed again in
// afterEach, also when the test fails). The order is closed there too (withdrawn while Pending,
// delivered by the mock courier once accepted): the seeded restaurant is shared, and orders left Pending count
// towards its limit of 10. Runs on desktop Chrome and on the
// iPhone project.
test.use({ storageState: storageState("restaurant") });

const VISOKO = { latitude: 43.9889, longitude: 18.1781 };

// The order this test sent and whether the store accepted it, closed in afterEach.
let sentOrderId: number | null = null;
let accepted = false;

test.afterEach(async () => {
  if (sentOrderId !== null) {
    const api = await apiAs(accepted ? "store" : "restaurant");
    if (accepted) {
      // A delivery order is completed by the courier's delivery, never by the store.
      await simulateCourier(api, sentOrderId, "courier_assigned");
      await simulateCourier(api, sentOrderId, "picked_up");
      await simulateCourier(api, sentOrderId, "delivered");
    } else {
      await cancelOrder(api, sentOrderId);
    }
    await api.dispose();
    sentOrderId = null;
    accepted = false;
  }
  await setPinAs("store", null);
  await setPinAs("restaurant", null);
});

test("a restaurant orders with delivery from the cart, and the store accepts it with a ready time", async ({ page, browser }) => {
  // Delivery is for today and accepting needs a ready time today (30 minutes ahead here); near
  // midnight there is none left, as in delivery-flow.spec.ts.
  test.skip(24 * 60 - sarajevoMinutesNow() < 45, "no ready time left today");
  // The store at the town centre, the restaurant about 2 km north-east: a short mock delivery.
  await setPinAs("store", VISOKO);
  await setPinAs("restaurant", { latitude: VISOKO.latitude + 0.015, longitude: VISOKO.longitude + 0.015 });
  const productName = uniqueName("E2E Dostava Mlijeko");
  const storeApi = await apiAs("store");
  const product = await createProduct(storeApi, { name: productName, unit: "kom", quantity: 5 });
  await storeApi.dispose();
  await emptyCart(page);
  const added = await page.request.put(`${API_URL}/api/cart/items/${product.id}`, { data: { quantity: 2 } });
  expect(added.ok()).toBe(true);

  await test.step("Dostava u korpi: okvirna cijena i vrijeme", async () => {
    await open(page, "/cart");
    await page.getByRole("group", { name: "Način preuzimanja" }).getByText("Dostava", { exact: true }).click();
    const estimate = page.getByTestId("delivery-estimate");
    await expect(estimate.getByText(/Dolazak u restoran: \d{2}:\d{2}/)).toBeVisible();
    await expect(estimate.getByText("Kuriru plaćate u gotovini")).toBeVisible();
    await expect(page.getByText("Vrijeme preuzimanja")).toHaveCount(0);
  });

  await test.step("Slanje bez termina preuzimanja", async () => {
    await page.getByRole("button", { name: "Pošalji narudžbu" }).click();
    const href = await page.getByRole("link", { name: "Pogledaj narudžbu" }).getAttribute("href");
    sentOrderId = Number(href?.split("/").pop());
    await expect(page.getByText(/Dolazak u restoran: \d{2}:\d{2}\. Okvirna cijena dostave/)).toBeVisible();
  });

  await test.step("Stranica narudžbe pokazuje dostavu", async () => {
    await page.getByRole("link", { name: "Pogledaj narudžbu" }).click();
    await expect(page.getByTestId("money-card")).toContainText("+ dostava okvirno");
    // The address is under "Detalji narudžbe" (collapsed at first).
    await page.getByRole("button", { name: /Detalji narudžbe/ }).click();
    await expect(page.getByText("Adresa dostave")).toBeVisible();
    await expect(page.getByText("Branilaca 2, Visoko")).toBeVisible();
  });

  await test.step("Prodavnica prihvata s vremenom spremnosti, dostava se naručuje", async () => {
    const storeContext = await browser.newContext({ storageState: storageState("store") });
    const store = await storeContext.newPage();
    await open(store, `/orders/${sentOrderId}`);
    await store.getByRole("button", { name: "Odluči" }).click();
    const dialog = store.getByRole("dialog");
    await dialog.getByRole("button", { name: "Potvrdi odluku" }).click();
    const ready = dialog.getByTestId("ready-time");
    await expect(ready.getByText("Kada će narudžba biti spremna za kurira?")).toBeVisible();
    await ready.getByRole("button", { name: "30 minuta" }).click();
    await dialog.getByRole("button", { name: "Sačuvaj odluku" }).click();
    await expect(toast(store, "Odluka o narudžbi je sačuvana.")).toBeVisible();
    // Only once the server took the decision: afterEach then lets the courier deliver it,
    // otherwise it withdraws the order (a Pending one has no delivery to simulate).
    accepted = true;
    await expect(store.getByText("Dostava naručena, čeka kurira")).toBeVisible();
    await expect(store.getByText("Spremno za kurira")).toBeVisible();
    await storeContext.close();
  });

  await test.step("Restoran vidi konačnu cijenu i iznos za kurira", async () => {
    await reload(page);
    await expect(page.getByTestId("hero-title")).toHaveText("Prihvaćeno");
    await expect(page.getByTestId("hero-line")).toHaveText(/^Dostavna služba traži kurira · spremno za kurira u \d{2}:\d{2}$/);
    const money = page.getByTestId("money-card");
    await expect(money).toContainText("Kuriru plaćate gotovinom");
    await expect(money).toContainText(/Roba .+ \+ dostava .+/);
  });
});
