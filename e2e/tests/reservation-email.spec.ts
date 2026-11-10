import { expect, test } from "@playwright/test";
import { ACCOUNTS, APP_URL, storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct, orderCode } from "../support/api.js";
import { sarajevoDate } from "../support/dates.js";
import { MAILPIT_URL, waitForEmail } from "../support/mailpit.js";
import { toast } from "../support/ui.js";

// Locally the test needs Mailpit (docs/e2e.md); CI always runs it.
test.skip(
  !MAILPIT_URL && !process.env.CI,
  "Set MAILPIT_URL and EMAIL_PROVIDER=smtp in e2e/.env.e2e and start Mailpit to run this test.",
);

test("the store gets an email for a new order, and its link opens its list", async ({ browser }) => {
  expect(MAILPIT_URL, "MAILPIT_URL must be set in CI").toBeTruthy();
  const productName = uniqueName("E2E Sir");
  const storeApi = await apiAs("store");
  await createProduct(storeApi, { name: productName, quantity: 10, unit: "kg" });
  await storeApi.dispose();

  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const restaurant = await restaurantContext.newPage();

  await test.step("Restoran rezerviše 2,5 kg", async () => {
    await restaurant.goto("/browse-products");
    await restaurant.getByPlaceholder("Pretraga po imenu").fill(productName);
    const card = restaurant
      .getByTestId("product-card")
      .filter({ has: restaurant.getByRole("heading", { name: productName }) });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "Rezerviši" }).click();
    const dialog = restaurant.getByRole("dialog");
    await dialog.getByLabel("Datum preuzimanja").fill(sarajevoDate(1));
    await dialog.getByLabel("Datum preuzimanja").press("Enter");
    await dialog.getByLabel("Vrijeme preuzimanja").fill("12:00");
    await dialog.getByLabel("Količina").fill("2.5");
    await dialog.getByRole("button", { name: "Potvrdi" }).click();
    await expect(toast(restaurant, "Rezervacija uspješno kreirana.")).toBeVisible();
  });
  await restaurantContext.close();

  const restaurantApi = await apiAs("restaurant");
  const code = await orderCode(restaurantApi, productName);
  await restaurantApi.dispose();

  const email = await test.step("Prodavnica dobija email u Mailpitu", async () => {
    // The subject names the order, the text lists its products.
    const message = await waitForEmail(`to:${ACCOUNTS.store.email} "${productName}"`);
    expect(message.To.map((to) => to.Address)).toEqual([ACCOUNTS.store.email]);
    expect(message.Subject).toBe(`Nova narudžba #${code} od ${ACCOUNTS.restaurant.businessName}`);
    expect(message.Text).toContain(`Narudžba: #${code}`);
    expect(message.Text).toContain(`- ${productName}, 2,5 kg: 5,00 KM`);
    expect(message.Text).toContain(`Restoran: ${ACCOUNTS.restaurant.businessName}`);
    expect(message.Text).toContain(`Preuzimanje: ${sarajevoDate(1).replaceAll("/", ".")}. 12:00`);
    expect(message.HTML).toContain(`Nova narudžba #${code}</h1>`);
    expect(message.HTML).toContain(">Otvori rezervacije</a>");
    return message;
  });

  // Until the order details page exists (orders PR 3b), the link opens the store's list.
  await test.step("Link iz emaila otvara listu prodavnice s narudžbom", async () => {
    const link = /Otvori rezervacije: (\S+)/.exec(email.Text)?.[1];
    expect(link).toBe(`${APP_URL}/reservations`);
    expect(email.HTML).toContain(`href="${link}"`);

    const storeContext = await browser.newContext({ storageState: storageState("store") });
    const store = await storeContext.newPage();
    await store.goto(link!);
    await store.getByPlaceholder("Pretraga po imenu").fill(productName);
    await expect(store.getByTestId("reservation-card").filter({ has: store.getByRole("heading", { name: productName }) })).toHaveCount(1);
    await storeContext.close();
  });
});
