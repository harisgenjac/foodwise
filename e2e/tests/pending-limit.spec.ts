import { expect, request, test } from "@playwright/test";
import { API_URL, uniqueName } from "../support/accounts.js";
import { apiAs, cancelOrder, createProduct, createStoreWithoutPlan, sendOrder } from "../support/api.js";
import { addToCart, checkout, toast } from "../support/ui.js";

// At most 10 Pending orders per restaurant (docs/orders-design.md, section 6): the cart warns from
// 8 on and the 11th is refused. A fresh restaurant, so the count starts at zero (the seeded one
// keeps pending orders from other specs).
test("the cart warns near the pending-order limit and refuses the order past it", async ({ browser }) => {
  const productName = uniqueName("E2E Brašno");
  const storeApi = await apiAs("store");
  await createProduct(storeApi, { name: productName, quantity: 10, unit: "kg" });
  // The orders that fill the limit take another product: sending an order removes its products
  // from the cart.
  const filler = await createProduct(storeApi, { name: uniqueName("E2E Šećer"), quantity: 50, unit: "kg" });
  await storeApi.dispose();

  const restaurant = await createStoreWithoutPlan("RESTAURANT");
  const restaurantApi = await request.newContext({ baseURL: API_URL, storageState: restaurant.storageState });
  const context = await browser.newContext({ storageState: restaurant.storageState });
  const page = await context.newPage();
  const sent: number[] = [];

  try {
    await test.step("Osam narudžbi čeka odgovor: korpa upozorava", async () => {
      for (let i = 0; i < 8; i++) sent.push((await sendOrder(restaurantApi, filler.id, 1)).id);
      await addToCart(page, productName, "1");
      await page.goto("/cart");
      await expect(page.getByText("Imate 8 od najviše 10 narudžbi koje čekaju odgovor prodavnice.")).toBeVisible();
    });

    await test.step("Deset narudžbi čeka odgovor: jedanaesta se ne šalje", async () => {
      for (let i = 0; i < 2; i++) sent.push((await sendOrder(restaurantApi, filler.id, 1)).id);
      await page.reload();
      await expect(page.getByText("Imate 10 od najviše 10 narudžbi koje čekaju odgovor prodavnice.")).toBeVisible();
      await checkout(page);
      await expect(
        toast(page, "Imate previše narudžbi koje čekaju odgovor (10). Sačekajte da prodavnice odgovore ili otkažite neku."),
      ).toBeVisible();
      await expect(page.getByTestId("cart-line").filter({ hasText: productName })).toBeVisible();
    });

    await test.step("Nakon otkazivanja jedne narudžbe korpa se šalje", async () => {
      await cancelOrder(restaurantApi, sent.shift()!);
      await page.getByRole("button", { name: "Pošalji narudžbu" }).click();
      await expect(page.getByRole("heading", { level: 1, name: /^Narudžba #[A-Z0-9]{4} je poslana$/ })).toBeVisible();
    });
  } finally {
    // Free the store's quantity again; the restaurant is this test's own.
    const { orders } = (await (await restaurantApi.get("/api/orders/mine?scope=active")).json()) as { orders: { id: number }[] };
    for (const order of orders) await cancelOrder(restaurantApi, order.id);
    await restaurantApi.dispose();
    await context.close();
  }
});
