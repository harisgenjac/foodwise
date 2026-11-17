import { expect, test, type APIRequestContext } from "@playwright/test";
import { API_URL, storageState, uniqueName, type SeededRole } from "../support/accounts.js";
import { apiAs, cancelOrder, createProduct, simulateCourier } from "../support/api.js";
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

// Sets or clears a business's pin through its own profile, keeping the rest of the profile.
const setPin = async (role: SeededRole, location: { latitude: number; longitude: number } | null) => {
  const api: APIRequestContext = await apiAs(role);
  const me = (await (await api.get("/api/users/me")).json()).user;
  const response = await api.put("/api/users/me", {
    data: {
      first_name: me.first_name,
      last_name: me.last_name,
      business_name: me.business_name,
      city_id: me.city_id,
      phone: me.phone,
      address: me.address,
      location,
    },
  });
  expect(response.ok(), `PUT /api/users/me as ${role} → ${response.status()}`).toBe(true);
  await api.dispose();
};

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
  await setPin("store", null);
  await setPin("restaurant", null);
});

test("a restaurant orders with delivery from the cart, and the store accepts it with a ready time", async ({ page, browser }) => {
  // The store at the town centre, the restaurant about 2 km north-east: a short mock delivery.
  await setPin("store", VISOKO);
  await setPin("restaurant", { latitude: VISOKO.latitude + 0.015, longitude: VISOKO.longitude + 0.015 });
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
    await expect(estimate.getByText(/Dostava danas, okvirno oko \d{2}:\d{2}/)).toBeVisible();
    await expect(estimate.getByText("Kuriru plaćate u gotovini")).toBeVisible();
    await expect(page.getByText("Vrijeme preuzimanja")).toHaveCount(0);
  });

  await test.step("Slanje bez termina preuzimanja", async () => {
    await page.getByRole("button", { name: "Pošalji narudžbu" }).click();
    const href = await page.getByRole("link", { name: "Pogledaj narudžbu" }).getAttribute("href");
    sentOrderId = Number(href?.split("/").pop());
    await expect(page.getByText(/Dostava danas, okvirno oko \d{2}:\d{2}\. Okvirna cijena dostave/)).toBeVisible();
  });

  await test.step("Stranica narudžbe pokazuje dostavu", async () => {
    await page.getByRole("link", { name: "Pogledaj narudžbu" }).click();
    await expect(page.getByText("Adresa dostave")).toBeVisible();
    await expect(page.getByText("Branilaca 2, Visoko")).toBeVisible();
    await expect(page.getByText("Cijena dostave (okvirno)")).toBeVisible();
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
    accepted = true;
    await expect(toast(store, "Odluka o narudžbi je sačuvana.")).toBeVisible();
    await expect(store.getByText("Dostava naručena, čeka kurira")).toBeVisible();
    await expect(store.getByText("Spremno za kurira")).toBeVisible();
    await storeContext.close();
  });

  await test.step("Restoran vidi konačnu cijenu i iznos za kurira", async () => {
    await reload(page);
    await expect(page.getByText("Dostava naručena, čeka kurira")).toBeVisible();
    await expect(page.getByText("Cijena dostave", { exact: true })).toBeVisible();
    await expect(page.getByText("Kuriru se plaća (roba + dostava)")).toBeVisible();
  });
});
