import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct, orderCode, sendOrder } from "../support/api.js";
import { MAILPIT_URL, countEmails, waitForEmail } from "../support/mailpit.js";
import { toast } from "../support/ui.js";

// The store switches its email notifications off on My profile: a new order sends it no
// email. Switched on again, the next one does. Uses brezaStore (only nearby-offers.spec.ts reads its
// products, by name), so the shared store never has its emails off, and switches it back on after
// the test even when it fails.
const STORE = ACCOUNTS.brezaStore;

test.skip(
  !MAILPIT_URL && !process.env.CI,
  "Set MAILPIT_URL and EMAIL_PROVIDER=smtp in e2e/.env.e2e and start Mailpit to run this test.",
);
test.use({ storageState: storageState("brezaStore") });

test.afterEach(async () => {
  const api = await apiAs("brezaStore");
  await api.patch("/api/users/me/email-notifications", { data: { enabled: true } });
  await api.dispose();
});

const emailSwitch = (page: Page) => page.getByRole("switch", { name: "Obavijesti emailom" });

// A product of the store, ordered by the restaurant through the API.
const orderNew = async (prefix: string) => {
  const productName = uniqueName(prefix);
  const storeApi = await apiAs("brezaStore");
  const product = await createProduct(storeApi, { name: productName, quantity: 10, unit: "kg" });
  await storeApi.dispose();
  const restaurantApi = await apiAs("restaurant");
  await sendOrder(restaurantApi, product.id, 1);
  await restaurantApi.dispose();
  return productName;
};

test("a store with email notifications off gets no email, and gets one again once they are on", async ({ page }) => {
  expect(MAILPIT_URL, "MAILPIT_URL must be set in CI").toBeTruthy();

  await test.step("Prodavnica isključuje email obavijesti na Moj profil", async () => {
    await page.goto("/my-profile");
    await expect(emailSwitch(page)).toHaveAttribute("aria-checked", "true");
    await emailSwitch(page).click();
    await expect(toast(page, "Email obavijesti su isključene.")).toBeVisible();
    await expect(emailSwitch(page)).toHaveAttribute("aria-checked", "false");
    // Saved: still off after a reload.
    await page.reload();
    await expect(emailSwitch(page)).toHaveAttribute("aria-checked", "false");
  });

  const mutedProduct = await test.step("Restoran naručuje dok su isključene", () => orderNew("E2E Tišina"));

  await test.step("Prodavnica ponovo uključuje email obavijesti", async () => {
    await emailSwitch(page).click();
    await expect(toast(page, "Email obavijesti su uključene.")).toBeVisible();
    await expect(emailSwitch(page)).toHaveAttribute("aria-checked", "true");
  });

  const product = await test.step("Restoran naručuje dok su uključene", () => orderNew("E2E Zvono"));

  await test.step("Mailpit: email samo za drugu narudžbu", async () => {
    const restaurantApi = await apiAs("restaurant");
    const code = await orderCode(restaurantApi, product);
    await restaurantApi.dispose();
    // The order email lists the product in its text.
    const email = await waitForEmail(`to:${STORE.email} "${product}"`);
    expect(email.Subject).toBe(`Nova narudžba #${code} od ${ACCOUNTS.restaurant.businessName}`);
    expect(email.Text).toContain("Isključite email obavijesti: ");
    // The worker sends in order, so the first order's email would have arrived by now.
    expect(await countEmails(`to:${STORE.email} "${mutedProduct}"`)).toBe(0);
  });
});

test("the emails' footer link opens My profile at the switch, on a phone too", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/my-profile#email-notifications");
  const theSwitch = emailSwitch(page);
  await expect(theSwitch).toBeInViewport();
  const box = await theSwitch.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});
