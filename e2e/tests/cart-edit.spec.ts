import { expect, test, type Page } from "@playwright/test";
import { runId, storageState } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { isoDate, sarajevoDate } from "../support/dates.js";
import { addToCart, emptyCart, open, reload } from "../support/ui.js";

// Editing the cart before sending (docs/orders-design.md, section 4): a line's quantity, removing a
// line, emptying the cart, and a pickup date after the earliest expiry date. The seeded restaurant
// is shared by the specs, so the test starts and ends with an empty cart; it sends nothing.

const cartLine = (page: Page, name: string) => page.getByTestId("cart-line").filter({ hasText: name });

test.describe("editing the cart", () => {
  let restaurant: Page;

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext({ storageState: storageState("restaurant") });
    restaurant = await context.newPage();
    await emptyCart(restaurant);
  });

  test.afterEach(async () => {
    await emptyCart(restaurant);
    await restaurant.context().close();
  });

  test("changes a quantity, removes a line, refuses a late pickup date and empties the cart", async () => {
    const id = runId();
    const cheese = `E2E Kajmak ${id}`;
    const yogurt = `E2E Jogurt ${id}`;
    const storeApi = await apiAs("store");
    // 2 KM per kg; the yogurt expires first (in 2 days), so the pickup is due by then.
    await createProduct(storeApi, { name: cheese, quantity: 10 });
    await createProduct(storeApi, { name: yogurt, quantity: 10, expiry_date: isoDate(2), discounted_price: 1 });
    await storeApi.dispose();

    const checkoutForm = restaurant.getByRole("form", { name: "Narudžba" });
    const total = checkoutForm.getByText(/^\d+\.\d{2} KM$/);

    await test.step("Restoran puni korpu", async () => {
      await addToCart(restaurant, cheese, "2");
      await addToCart(restaurant, yogurt, "3");
      await expect(restaurant.getByRole("link", { name: "Korpa, 2 proizvoda" })).toBeVisible();
      await open(restaurant, "/cart");
      await expect(restaurant.getByTestId("cart-line")).toHaveCount(2);
      await expect(total).toHaveText("7.00 KM");
    });

    await test.step("Mijenja količinu na liniji", async () => {
      const quantity = cartLine(restaurant, cheese).getByLabel(`Količina: ${cheese}`);
      await quantity.fill("5");
      await quantity.press("Enter");
      await expect(cartLine(restaurant, cheese).getByText("10.00 KM")).toBeVisible();
      await expect(total).toHaveText("13.00 KM");
      // Still 5 after a reload: the cart is kept on the server.
      await reload(restaurant);
      await expect(cartLine(restaurant, cheese).getByLabel(`Količina: ${cheese}`)).toHaveValue("5");
    });

    await test.step("Datum preuzimanja poslije roka trajanja se ne šalje", async () => {
      await expect(checkoutForm.getByText(`Preuzimanje najkasnije ${sarajevoDate(2)}`, { exact: false })).toBeVisible();
      await checkoutForm.getByLabel("Datum preuzimanja").fill(sarajevoDate(5));
      await checkoutForm.getByLabel("Datum preuzimanja").press("Enter");
      await checkoutForm.getByLabel("Vrijeme preuzimanja").fill("12:00");
      await checkoutForm.getByRole("button", { name: "Pošalji narudžbu" }).click();
      await expect(checkoutForm.getByText("Datum mora biti između danas i datuma isteka.")).toBeVisible();
      await expect(restaurant.getByRole("heading", { level: 1, name: /je poslana$/ })).toHaveCount(0);
    });

    await test.step("Uklanja liniju", async () => {
      await restaurant.getByRole("button", { name: `Ukloni ${yogurt} iz korpe` }).click();
      await expect(cartLine(restaurant, yogurt)).toHaveCount(0);
      await expect(restaurant.getByRole("link", { name: "Korpa, 1 proizvod" })).toBeVisible();
      await expect(total).toHaveText("10.00 KM");
    });

    await test.step("Prazni korpu", async () => {
      await restaurant.getByRole("button", { name: "Isprazni korpu" }).click();
      const confirm = restaurant.getByRole("dialog", { name: "Isprazniti korpu?" });
      await expect(confirm.getByText("Svi proizvodi će biti uklonjeni iz korpe.")).toBeVisible();
      await confirm.getByRole("button", { name: "Isprazni korpu" }).click();
      await expect(restaurant.getByRole("heading", { name: "Korpa je prazna" })).toBeVisible();
      await expect(restaurant.getByRole("link", { name: "Korpa", exact: true })).toBeVisible();
    });
  });
});
