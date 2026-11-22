import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, storageState, uniqueName } from "../support/accounts.js";
import { apiAs, createProduct, myId } from "../support/api.js";
import { isoDate, sarajevoDate } from "../support/dates.js";
import { emptyCart, open, sentOrderCode, toast } from "../support/ui.js";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

test.use({ storageState: storageState("restaurant") });

// Runs on desktop Chrome (the cart panel on the right, sending from it) and on the iPhone project
// (the cart bar at the bottom that opens the cart).
test("a restaurant shops on the store page with + and the stepper", async ({ page }) => {
  const prefix = uniqueName("E2E Stranica");
  const soonName = `${prefix} Jogurt`;
  const laterName = `${prefix} Hljeb`;
  const storeApi = await apiAs("store");
  const storeId = await myId(storeApi);
  await createProduct(storeApi, { name: soonName, category: "Dairy", unit: "kom", quantity: 5, expiry_date: isoDate(1) });
  await createProduct(storeApi, { name: laterName, category: "Bakery", unit: "kom", quantity: 5, expiry_date: isoDate(4) });
  await storeApi.dispose();
  await emptyCart(page);

  await test.step("Zaglavlje: otvoreno, preuzimanje danas, kratke statistike", async () => {
    await open(page, `/stores/${storeId}`);
    await expect(page.getByRole("heading", { level: 1, name: ACCOUNTS.store.businessName })).toBeVisible();
    // The e2e store is open all day, every day (support/seed.ts).
    await expect(page.getByText("Otvoreno", { exact: true })).toBeVisible();
    await expect(page.getByText("Preuzimanje danas: 10:00–18:00")).toBeVisible();
    await expect(page.getByText("Aktivne ponude")).toBeVisible();
  });

  await test.step("Ističe uskoro prvo, ostalo po kategoriji; pretraga u prodavnici", async () => {
    await page.getByLabel("Pretraga u ovoj prodavnici").fill(prefix);
    const soon = page.getByRole("region", { name: "Ističe uskoro" });
    await expect(soon.getByText(soonName)).toBeVisible();
    await expect(soon.getByText(laterName)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Pekarski proizvodi" }).getByText(laterName)).toBeVisible();
  });

  await test.step("+ dodaje u korpu i postaje stepper", async () => {
    const card = page.getByTestId("store-product-card").filter({ hasText: soonName });
    await card.getByRole("button", { name: `Dodaj u korpu: ${soonName}` }).click();
    const stepper = card.getByRole("group", { name: `Količina u korpi: ${soonName}` });
    await expect(stepper.getByText("1 kom")).toBeVisible();
    await stepper.getByRole("button", { name: `Povećaj količinu: ${soonName}` }).click();
    await expect(stepper.getByText("2 kom")).toBeVisible();
  });

  if (isPhone(page)) {
    await test.step("Telefon: traka korpe otvara korpu", async () => {
      const bar = page.getByTestId("store-cart-bar");
      await expect(bar).toContainText("Korpa · 1 proizvod");
      await expect(page.getByRole("region", { name: "Korpa" })).toBeHidden();
      await bar.click();
      await expect(page).toHaveURL(/\/cart$/);
      await expect(page.getByTestId("cart-line").filter({ hasText: soonName })).toBeVisible();
    });
  } else {
    await test.step("Desktop: korpa desno, slanje s djelimičnom isporukom", async () => {
      await expect(page.getByTestId("store-cart-bar")).toBeHidden();
      const panel = page.getByRole("region", { name: "Korpa" });
      await expect(panel.getByTestId("store-cart-line").filter({ hasText: soonName })).toBeVisible();
      const checkout = page.getByRole("form", { name: "Narudžba" });
      await checkout.getByLabel("Datum preuzimanja").fill(sarajevoDate(1));
      await checkout.getByLabel("Datum preuzimanja").press("Enter");
      await checkout.getByLabel("Vrijeme preuzimanja").fill("12:00");
      await expect(checkout.getByRole("checkbox", { name: /Prihvatam djelimičnu isporuku/ })).toBeChecked();
      await checkout.getByRole("button", { name: "Pošalji narudžbu" }).click();
      await expect(page).toHaveURL(/\/cart$/);
      await sentOrderCode(page);
    });
  }
});

test.describe("the store's own side", () => {
  test.use({ storageState: storageState("store") });

  test("a store sets its weekly pickup hours on My profile", async ({ page, browser }) => {
    const storeApi = await apiAs("store");
    // The profile as the seed made it, to put back exactly at the end.
    const { user: before } = await (await storeApi.get("/api/users/me")).json();
    await open(page, "/my-profile");
    const pickup = page.getByRole("group", { name: "Vrijeme preuzimanja" });
    await pickup.getByLabel("Otvoreno: Nedjelja").uncheck();
    await page.getByRole("button", { name: "Sačuvaj", exact: true }).click();
    await expect(toast(page, "Profil uspješno ažuriran.")).toBeVisible();

    const restaurantContext = await browser.newContext({ storageState: storageState("restaurant") });
    const restaurant = await restaurantContext.newPage();
    await open(restaurant, `/stores/${await myId(storeApi)}`);
    await restaurant.getByRole("tab", { name: "Informacije" }).click();
    const info = restaurant.getByRole("tabpanel");
    await expect(info.getByText("Pon–Sub")).toBeVisible();
    await expect(info.getByText("zatvoreno")).toBeVisible();
    await restaurantContext.close();

    // Leave the shared store as the seed made it: its own pickup hours every day (ticking
    // Sunday again in the form would give it the default 08:00–20:00, which breaks the next run
    // that reads today's hours on a Sunday).
    const restored = await storeApi.put("/api/users/me", {
      data: {
        first_name: before.first_name,
        last_name: before.last_name,
        business_name: before.business_name,
        city_id: before.city_id,
        address: before.address,
        phone: before.phone,
        pickup_schedule: before.pickup_schedule,
      },
    });
    expect(restored.ok()).toBe(true);
    await storeApi.dispose();
  });
});
