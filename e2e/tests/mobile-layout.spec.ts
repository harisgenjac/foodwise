import { expect, test, type Locator, type Page } from "@playwright/test";
import { runId, storageState, type SeededRole } from "../support/accounts.js";
import { apiAs, createDonation, createProduct, createStoreWithoutPlan, myId, requestSubscription, reserve } from "../support/api.js";

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

// iOS zooms into a focused field whose text is under 16 px; every visible text field on the page
// must be at least that large.
const expectNoSmallFieldText = async (page: Page, path: string) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")]
      .filter((field) => !["checkbox", "radio", "file", "hidden"].includes(field.type))
      .filter((field) => field.getBoundingClientRect().width > 0 && getComputedStyle(field).visibility !== "hidden")
      .filter((field) => parseFloat(getComputedStyle(field).fontSize) < 16)
      .map((field) => `${field.tagName.toLowerCase()} "${field.getAttribute("placeholder") ?? field.getAttribute("aria-label") ?? field.name}" ${getComputedStyle(field).fontSize}`),
  );
  expect(small, `${path}: fields under 16 px`).toEqual([]);
};

let productId: number;
let reservationId: number;
let storeId: number;
let restaurantId: number;
const donationIds: Partial<Record<SeededRole, number>> = {};

test.beforeAll(async () => {
  const storeApi = await apiAs("store");
  const restaurantApi = await apiAs("restaurant");
  productId = (await createProduct(storeApi, { name: `E2E Mobilni ${runId()}` })).id;
  storeId = await myId(storeApi);
  restaurantId = await myId(restaurantApi);
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

  test("form fields use at least 16 px text on My profile, Add product and New donation", async ({ page }) => {
    for (const path of ["/my-profile", "/add-product", "/donate-food/new"]) await expectNoSmallFieldText(page, path);
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

// Dialogs on a short phone (iPhone SE, 667 px): the title and the buttons are on screen as soon as
// the dialog opens, only the dialog body scrolls, and the page behind stays still.
test.describe("dialogs at 375×667", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  const expectButtonsOnScreen = async (page: Page, dialog: Locator, buttons: string[]) => {
    const scrollBefore = await page.evaluate(() => window.scrollY);
    for (const name of buttons) {
      await expect(dialog.getByRole("button", { name, exact: true }), name).toBeInViewport({ ratio: 1 });
    }
    // The dialog fits the screen and the page underneath is locked, not scrolled.
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(667);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  };

  test.describe("restaurant", () => {
    test.use({ storageState: storageState("restaurant") });

    test("the reserve dialog shows its buttons, and Back closes it on the same page", async ({ page }) => {
      await page.goto(`/products/${productId}`);
      await page.getByRole("button", { name: "Rezerviši" }).click();
      const dialog = page.getByRole("dialog", { name: "Rezerviši" });
      await expectButtonsOnScreen(page, dialog, ["Otkaži", "Potvrdi"]);

      // The Android back button: the dialog closes and the page stays.
      await page.goBack();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
    });
  });

  test.describe("store without a plan", () => {
    // A fresh store each run, so the plans are offered right away (the seeded store has one).
    test.use({
      storageState: async ({}, use) => {
        await use((await createStoreWithoutPlan()).storageState);
      },
    });

    test("the subscribe dialog shows its buttons", async ({ page }) => {
      await page.goto("/my-profile#subscription");
      const standard = page.locator("#plan-options > div").filter({ has: page.getByText("Standard", { exact: true }) });
      await standard.getByRole("button", { name: "Odaberi" }).click();
      await expectButtonsOnScreen(page, page.getByRole("dialog", { name: "Pretplata: Standard" }), ["Odustani", "Pošalji zahtjev"]);
    });
  });

  test.describe("admin", () => {
    test.use({ storageState: storageState("admin") });

    test("the confirm dialog with a reason shows its buttons", async ({ page }) => {
      await page.goto(`/admin/users/${restaurantId}`);
      await page.getByRole("button", { name: "Blokiraj nalog" }).click();
      const dialog = page.getByRole("dialog", { name: "Blokirati nalog?" });
      await dialog.getByLabel("Razlog").focus();
      await expectButtonsOnScreen(page, dialog, ["Odustani", "Blokiraj"]);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });

    test("the edit profile dialog scrolls to its last field, with the buttons in view", async ({ page }) => {
      await page.goto(`/admin/users/${storeId}`);
      await page.getByRole("button", { name: "Uredi profil" }).click();
      const dialog = page.getByRole("dialog", { name: "Uredi profil korisnika" });
      await expectButtonsOnScreen(page, dialog, ["Odustani", "Sačuvaj profil"]);

      // Taller than the screen: the body scrolls inside the dialog.
      const body = dialog.getByTestId("modal-body");
      const { scrollHeight, clientHeight } = await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
      expect(scrollHeight).toBeGreaterThan(clientHeight);
      const lastField = dialog.getByLabel("Opis");
      await expect(lastField).not.toBeInViewport();
      await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await expect(lastField).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole("button", { name: "Sačuvaj profil" })).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole("heading", { name: "Uredi profil korisnika" })).toBeInViewport({ ratio: 1 });
    });
  });
});

// The admin's credit lists are cards below md: nothing wider than the screen, and the approve and
// reject buttons of a pending request reachable without scrolling sideways.
test.describe("admin", () => {
  test.use({ storageState: storageState("admin") });
  let businessName: string;

  test.beforeAll(async () => {
    const account = await createStoreWithoutPlan();
    businessName = account.businessName;
    await requestSubscription(account.storageState);
  });

  const expectFits = async (page: Page, path: string) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, `${path} is wider than the screen`).toBeLessThanOrEqual(innerWidth);
    // Cards, not the table.
    await expect(page.getByRole("table"), path).toBeHidden();
    await expect(page.getByTestId("data-card").first(), path).toBeVisible();
  };

  test("the credit requests and credits pages fit a 375 px screen", async ({ page }) => {
    await expectFits(page, "/admin/credit-requests");
    await expectFits(page, "/admin/credits");
    await expect(page.getByRole("combobox", { name: "Sortiraj po" })).toBeVisible();
  });

  test("a pending request's approve and reject buttons are on screen without sideways scrolling", async ({ page }) => {
    await page.goto("/admin/credit-requests?status=PENDING");
    const card = page.getByTestId("data-card").filter({ hasText: businessName });
    for (const name of ["Odobri", "Odbij"]) {
      const button = card.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button, name).toBeInViewport({ ratio: 1 });
      const box = (await button.boundingBox())!;
      expect(box.x, name).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, name).toBeLessThanOrEqual(375);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    await card.getByRole("button", { name: "Odobri", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Odobriti zahtjev?" })).toBeVisible();
  });
});

test.describe("restaurant", () => {
  test.use({ storageState: storageState("restaurant") });

  test("every page fits a 375 px screen", async ({ page }) => {
    const details = [`/stores/${storeId}`, `/products/${productId}`, `/reservation/${reservationId}`, `/donate-food/${donationIds.restaurant}/edit`];
    for (const path of [...RESTAURANT_PAGES, ...SHARED_PAGES, ...details]) await expectPhoneLayout(page, path);
  });

  test("the meal donation form uses at least 16 px text", async ({ page }) => {
    // A restaurant's form starts on meals, with the allergen and serving fields.
    await expectNoSmallFieldText(page, "/donate-food/new");
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
