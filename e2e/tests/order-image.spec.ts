import { expect, test } from "@playwright/test";
import { storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct, sendOrderOf } from "../support/api.js";
import { open } from "../support/ui.js";

// A 1×1 PNG for the store's logo.
const PNG = {
  name: "logo.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
};

test.use({ storageState: storageState("restaurant") });

// Runs on desktop Chrome and on the iPhone project (phone width) for the restaurant's side.
test("an order shows the other party's logo, or the generic image, and its first products", async ({ page, browser }) => {
  const prefix = uniqueName("E2E Slika narudžbe");
  const storeApi = await apiAs("store");
  // The seeded store has no logo; it gets one for this test and loses it again at the end.
  expect((await storeApi.post("/api/users/me/logo", { multipart: { logo: PNG } })).ok()).toBe(true);

  try {
    const names = ["Jogurt", "Kefir", "Sir", "Pavlaka"].map((name) => `${prefix} ${name}`);
    const products = [];
    for (const name of names) {
      products.push(await createProduct(storeApi, { name, image_url: "suggested:dairy" }));
    }
    const restaurantApi = await apiAs("restaurant");
    await sendOrderOf(
      restaurantApi,
      products.map((product) => ({ productId: product.id, quantity: 1, unitPrice: 2 })),
    );
    await restaurantApi.dispose();

    await test.step("Restoran vidi logo prodavnice i prva tri proizvoda", async () => {
      await open(page, "/my-orders");
      await page.getByPlaceholder("Pretraga po proizvodu").fill(prefix);
      const card = page.getByTestId("order-card").filter({ hasText: names[0]! });
      await expect(card.getByTestId("order-logo")).toHaveAttribute("src", /\/uploads\/logos\//);
      for (const name of names.slice(0, 3)) {
        await expect(card.getByRole("img", { name })).toHaveAttribute("src", /images\.unsplash\.com/);
      }
      await expect(card.getByRole("img", { name: names[3]! })).toHaveCount(0);
      await expect(card.getByText("+1", { exact: true })).toBeVisible();

      await card.getByRole("link", { name: "Detalji" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("order-logo")).toHaveAttribute("src", /\/uploads\/logos\//);
    });

    await test.step("Prodavnica vidi opću sliku (restoran nema logo)", async () => {
      const storeContext = await browser.newContext({ storageState: storageState("store") });
      const store = await storeContext.newPage();
      await open(store, "/orders");
      await store.getByPlaceholder("Pretraga po proizvodu").fill(prefix);
      const card = store.getByTestId("order-card").filter({ hasText: names[0]! });
      await expect(card.getByTestId("order-generic-image")).toBeVisible();
      await expect(card.getByTestId("order-logo")).toHaveCount(0);
      await storeContext.close();
    });
  } finally {
    await storeApi.delete("/api/users/me/logo");
    await storeApi.dispose();
  }
});
