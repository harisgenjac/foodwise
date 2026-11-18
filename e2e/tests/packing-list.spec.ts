import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { API_URL, storageState, uniqueName } from "../support/accounts.js";
import { acceptOrder, apiAs, cancelOrder, completeOrder, createProduct, createStoreWithoutPlan, sendOrder } from "../support/api.js";
import { isoDate, sarajevoMinutesNow } from "../support/dates.js";
import { open } from "../support/ui.js";

// The store's packing list: today's accepted orders by ready time and every product summed. Two
// pickup orders for later today are sent and accepted through the API, then the list is read on
// the screen. A fresh restaurant sends them: the seeded one keeps pending orders from other specs and
// may already be at its limit of 10. The orders are closed in afterEach (picked up once accepted,
// withdrawn otherwise), as the seeded store is shared. Runs on desktop Chrome and on the iPhone project.
test.use({ storageState: storageState("store") });

const sent: { id: number; accepted: boolean }[] = [];
let restaurant: APIRequestContext | null = null;

test.afterEach(async () => {
  const store = await apiAs("store");
  for (const order of sent.splice(0)) {
    if (order.accepted) await completeOrder(store, order.id);
    else if (restaurant) await cancelOrder(restaurant, order.id);
  }
  await store.dispose();
  await restaurant?.dispose();
  restaurant = null;
});

test("the store's packing list shows today's orders by ready time with the products summed", async ({ page }) => {
  // A pickup time must still be ahead; near midnight there is no "later today" left.
  test.skip(sarajevoMinutesNow() > 23 * 60 + 40, "no pickup time left today");
  const productName = uniqueName("E2E Pakovanje Sir");
  const store = await apiAs("store");
  const fresh = await createStoreWithoutPlan("RESTAURANT");
  restaurant = await request.newContext({ baseURL: API_URL, storageState: fresh.storageState });
  const product = await createProduct(store, { name: productName, unit: "kg", quantity: 10 });
  // Sent in the opposite order of their pickup times: the list follows the time, not the sending.
  const later = await sendOrder(restaurant, product.id, 3, isoDate(0), "23:55");
  sent.push({ id: later.id, accepted: false });
  const earlier = await sendOrder(restaurant, product.id, 2, isoDate(0), "23:50");
  sent.push({ id: earlier.id, accepted: false });
  for (const order of sent) {
    await acceptOrder(store, order.id);
    order.accepted = true;
  }
  await store.dispose();

  await open(page, "/packing");
  await expect(page.getByRole("heading", { level: 1, name: "Spisak za pakovanje" })).toBeVisible();

  await test.step("Zbir po proizvodu", async () => {
    const total = page.getByTestId("packing-product").filter({ hasText: productName });
    await expect(total).toContainText("5 kg");
    await expect(total).toContainText("u 2 narudžbe");
  });

  await test.step("Narudžbe po vremenu spremnosti", async () => {
    const orders = page.getByTestId("packing-order");
    const codes = await orders.allTextContents();
    const earlierIndex = codes.findIndex((text) => text.includes(`#${earlier.code}`));
    const laterIndex = codes.findIndex((text) => text.includes(`#${later.code}`));
    expect(earlierIndex).toBeGreaterThanOrEqual(0);
    expect(laterIndex).toBeGreaterThan(earlierIndex);
    const first = orders.filter({ hasText: `#${earlier.code}` });
    await expect(first).toContainText("23:50");
    await expect(first).toContainText("2 kg");
    await expect(first.getByText("Preuzimanje", { exact: true })).toBeVisible();
  });

  await test.step("Štampa bez navigacije aplikacije", async () => {
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: "Štampaj" })).toBeHidden();
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(page.getByTestId("packing-order").filter({ hasText: `#${earlier.code}` })).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  });
});
