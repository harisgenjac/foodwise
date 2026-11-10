import { expect, test } from "@playwright/test";
import { ACCOUNTS, APP_URL, storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct } from "../support/api.js";
import { sarajevoDate } from "../support/dates.js";
import { MAILPIT_URL, waitForEmail } from "../support/mailpit.js";
import { orderFromMarketplace } from "../support/ui.js";

// Locally the test needs Mailpit (docs/e2e.md); CI always runs it.
test.skip(
  !MAILPIT_URL && !process.env.CI,
  "Set MAILPIT_URL and EMAIL_PROVIDER=smtp in e2e/.env.e2e and start Mailpit to run this test.",
);

test("the store gets an email for a new order, and its link opens the order", async ({ browser }) => {
  expect(MAILPIT_URL, "MAILPIT_URL must be set in CI").toBeTruthy();
  const productName = uniqueName("E2E Sir");
  const storeApi = await apiAs("store");
  await createProduct(storeApi, { name: productName, quantity: 10, unit: "kg" });
  await storeApi.dispose();

  const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
  const restaurant = await restaurantContext.newPage();

  const code = await test.step("Restoran naručuje 2,5 kg", () =>
    orderFromMarketplace(restaurant, productName, { quantity: "2.5" }),
  );
  await restaurantContext.close();

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
    expect(message.HTML).toContain(">Otvori narudžbu</a>");
    return message;
  });

  await test.step("Link iz emaila otvara narudžbu prodavnici", async () => {
    const link = /Otvori narudžbu: (\S+)/.exec(email.Text)?.[1];
    expect(link).toMatch(new RegExp(`^${APP_URL}/orders/\\d+$`));
    expect(email.HTML).toContain(`href="${link}"`);

    const storeContext = await browser.newContext({ storageState: storageState("store") });
    const store = await storeContext.newPage();
    await store.goto(link!);
    await expect(store.getByRole("heading", { level: 1, name: `Narudžba #${code}` })).toBeVisible();
    await expect(store.getByTestId("order-item").getByText(productName)).toBeVisible();
    await expect(store.getByRole("button", { name: "Odluči" })).toBeVisible();
    await storeContext.close();
  });
});
