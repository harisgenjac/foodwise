import { expect, test, type Page } from "@playwright/test";
import { runId, storageState, type SeededRole } from "../support/accounts.js";
import { apiAs, createDonation, createProduct, myId, reserve } from "../support/api.js";

// Phone width: every store and restaurant page fits the screen, with the bottom bar instead of the
// sidebar (docs/mobile-review.md, the navigation shell).
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

const STORE_PAGES = ["/dashboard", "/my-products", "/add-product", "/import-products", "/reservations"];
const RESTAURANT_PAGES = ["/dashboard", "/browse-products", "/stores", "/my-reservations"];
const SHARED_PAGES = ["/pickups", "/reports", "/credits", "/my-profile", "/donate-food", "/donate-food/new", "/sponsor", "/notifications"];

const bottomBar = (page: Page) => page.getByRole("navigation", { name: "Glavna navigacija" });

const expectPhoneLayout = async (page: Page, path: string) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(bottomBar(page), path).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Meni" }), path).toBeHidden();
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${path} is wider than the screen`).toBeLessThanOrEqual(innerWidth);
};

let productId: number;
let reservationId: number;
let storeId: number;
const donationIds: Partial<Record<SeededRole, number>> = {};

test.beforeAll(async () => {
  const storeApi = await apiAs("store");
  const restaurantApi = await apiAs("restaurant");
  productId = (await createProduct(storeApi, { name: `E2E Mobilni ${runId()}` })).id;
  storeId = await myId(storeApi);
  reservationId = (await reserve(restaurantApi, productId, 1)).id;
  donationIds.store = (await createDonation(storeApi, `E2E Mobilna donacija ${runId()}`)).id;
  donationIds.restaurant = (await createDonation(restaurantApi, `E2E Mobilni obrok ${runId()}`)).id;
  await storeApi.dispose();
  await restaurantApi.dispose();
});

test.describe("store", () => {
  test.use({ storageState: storageState("store") });

  test("every page fits a 375 px screen", async ({ page }) => {
    const details = [`/products/${productId}`, `/edit-product/${productId}`, `/reservation/${reservationId}`, `/donate-food/${donationIds.store}/edit`];
    for (const path of [...STORE_PAGES, ...SHARED_PAGES, ...details]) await expectPhoneLayout(page, path);
  });

  test("the notification panel fits the screen and closes on Escape", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Notifikacije" }).click();
    const panel = page.getByTestId("notifications-panel");
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y + box.height).toBeLessThanOrEqual(812);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });
});

test.describe("restaurant", () => {
  test.use({ storageState: storageState("restaurant") });

  test("every page fits a 375 px screen", async ({ page }) => {
    const details = [`/stores/${storeId}`, `/products/${productId}`, `/reservation/${reservationId}`, `/donate-food/${donationIds.restaurant}/edit`];
    for (const path of [...RESTAURANT_PAGES, ...SHARED_PAGES, ...details]) await expectPhoneLayout(page, path);
  });

  test("More opens the menu drawer and Escape closes it", async ({ page }) => {
    await page.goto("/dashboard");
    await bottomBar(page).getByRole("button", { name: "Više" }).click();
    const drawer = page.getByRole("dialog", { name: "Meni" });
    await expect(drawer.getByRole("link", { name: "Prodavnice" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });
});
